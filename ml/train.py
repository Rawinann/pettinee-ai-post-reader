"""Train on text only. Draft labels yield agreement metrics, never human accuracy."""
import sys, pathlib, json, re, unicodedata, hashlib, argparse, platform
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'ml-deps'))
import numpy as np
import sklearn
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.metrics import f1_score, classification_report, confusion_matrix
from difflib import SequenceMatcher
from importlib.metadata import version

CLASSES=['advice','compare','cost','experience','unclear']
def normal(text): return re.sub(r'\s+',' ',unicodedata.normalize('NFC',text).lower()).strip()
def sha(text): return hashlib.sha256(text.encode('utf-8')).hexdigest()
def load(path): return json.loads(path.read_text(encoding='utf-8'))
def save(path,value):
    temporary=path.with_suffix(path.suffix+'.tmp');temporary.write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf-8');temporary.replace(path)
def pipeline(): return Pipeline([('tfidf',TfidfVectorizer(analyzer='char',ngram_range=(2,5),preprocessor=normal,lowercase=False,max_features=12000,sublinear_tf=True)),('classifier',LogisticRegression(C=4,max_iter=1000,class_weight='balanced',random_state=42))])
def baseline(text):
    if re.search(r'กี่บาท|ค่ารักษา|ค่าใช้จ่าย|ค่าเอกซเรย์',text): return 'cost'
    if re.search(r'รีวิว|ยี่ห้อ|ควรซื้อ|ใช้ดี|ข้อเสีย',text): return 'compare'
    if re.search(r'แชร์ประสบการณ์|มาเล่า|รีวิวกรง|เตือนไว้',text): return 'experience'
    if re.search(r'ทำไง|ทำอย่างไร|ยังไง|อะไรคะ|อะไรครับ|ไหม|มั้ย|หรือไม่|แนะนำ|ปรึกษา|กี่วัน',text): return 'advice'
    return 'unclear'
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--reviewed-only',action='store_true');args=parser.parse_args()
    corpus=load(ROOT/'data/intent/corpus.json')['records'];annotations=load(ROOT/'data/intent/annotations.json')['labels'];labels={x['id']:x for x in annotations}
    rows=[p for p in corpus if normal(p['text']) and labels.get(p['id'],{}).get('label') in CLASSES and (not args.reviewed_only or labels[p['id']]['status']=='reviewed')]
    counts={c:sum(labels[p['id']]['label']==c for p in rows) for c in CLASSES}
    if min(counts.values())<5: raise SystemExit('Need at least 5 labeled texts in each class for grouped evaluation. Counts: '+str(counts))
    texts=np.array([normal(p['text']) for p in rows]);y=np.array([labels[p['id']]['label'] for p in rows]);parent=list(range(len(rows)))
    def find(i):
        while parent[i]!=i: parent[i]=parent[parent[i]];i=parent[i]
        return i
    for i in range(len(rows)):
        for j in range(i):
            if rows[i]['id']==rows[j]['id'] or SequenceMatcher(None,texts[i],texts[j],autojunk=False).ratio()>=0.86: parent[find(i)]=find(j)
    groups=np.array([find(i) for i in range(len(rows))]);fingerprint=sha('\n'.join(p['id']+'|'+normal(p['text']) for p in rows))
    split_path=ROOT/'data/intent'/('split-reviewed.json' if args.reviewed_only else 'split-draft.json')
    if split_path.exists():
        split=load(split_path)
        if split['corpusFingerprint']!=fingerprint: raise SystemExit('Dataset changed. Archive the old split/report before creating a new split.')
        test_ids=set(split['testIds']);test=np.array([i for i,p in enumerate(rows) if p['id'] in test_ids]);train=np.array([i for i,p in enumerate(rows) if p['id'] not in test_ids])
    else:
        train,test=next(StratifiedGroupKFold(n_splits=5,shuffle=True,random_state=42).split(texts,y,groups))
        split={'seed':42,'corpusFingerprint':fingerprint,'trainIds':[rows[i]['id'] for i in train],'testIds':[rows[i]['id'] for i in test],'nearDuplicateGrouping':'SequenceMatcher >= 0.86, text only; not fitted TF-IDF'};save(split_path,split)
    assert not (set(groups[train])&set(groups[test]))
    if set(y[train])!=set(CLASSES) or set(y[test])!=set(CLASSES): raise SystemExit('A class is missing from train/test; review split and collect more examples.')
    folds=[]
    for tr,va in StratifiedGroupKFold(n_splits=3,shuffle=True,random_state=43).split(texts[train],y[train],groups[train]):
        model=pipeline();model.fit(texts[train][tr],y[train][tr]);folds.append(float(f1_score(y[train][va],model.predict(texts[train][va]),average='macro',labels=CLASSES,zero_division=0)))
    trained=pipeline();trained.fit(texts[train],y[train]);pred=trained.predict(texts[test]);base=[baseline(t) for t in texts[test]]
    draft=any(labels[p['id']]['status']!='reviewed' for p in rows);kind='draft' if draft else 'reviewed'
    report={'version':1,'labelStatus':kind,'evaluationKind':'agreement_with_assistant_draft_labels_not_human_accuracy' if draft else 'agreement_with_user_reviewed_labels','counts':counts,'totalCorpusRows':len(corpus),'excludedNoText':sum(not p['text'].strip() for p in corpus),'used':len(rows),'trainSize':len(train),'testSize':len(test),'groupDisjoint':True,'trainOnlyCvMacroF1':folds,'macroF1':float(f1_score(y[test],pred,average='macro',labels=CLASSES,zero_division=0)),'keywordBaselineMacroF1':float(f1_score(y[test],base,average='macro',labels=CLASSES,zero_division=0)),'classes':CLASSES,'classificationReport':classification_report(y[test],pred,labels=CLASSES,output_dict=True,zero_division=0),'confusionMatrix':confusion_matrix(y[test],pred,labels=CLASSES).tolist(),'errors':[{'id':rows[i]['id'],'expected':str(y[i]),'predicted':str(p)} for i,p in zip(test,pred) if y[i]!=p],'limitations':['All labels need human review before any claim of real-world accuracy.','The excerpts are incomplete and may include Meta-generated text.','No diagnosis, urgency prediction, medication or treatment recommendation.','The review threshold is heuristic, not calibrated.'],'packages':{p:version(p) for p in ['scikit-learn','numpy','scipy']},'python':platform.python_version()}
    probabilities=trained.predict_proba(texts[test]);top=probabilities.max(axis=1);policy=np.array([str(p) if score>=0.55 else 'unclear' for p,score in zip(pred,top)])
    report['policyMacroF1']=float(f1_score(y[test],policy,average='macro',labels=CLASSES,zero_division=0));report['suggestionCount']=int(sum((top>=0.55)&(pred!='unclear')));report['reviewCount']=len(test)-report['suggestionCount']
    vec=trained.named_steps['tfidf'];clf=trained.named_steps['classifier'];model={'version':'intent-char-tfidf-lr-v1','normalization':'NFC + lowercase + collapse whitespace; unicode codepoints','trainingLabelStatus':kind,'ngramRange':[2,5],'vocabulary':{k:int(v) for k,v in vec.vocabulary_.items()},'idf':vec.idf_.tolist(),'classes':clf.classes_.tolist(),'weights':clf.coef_.tolist(),'intercepts':clf.intercept_.tolist(),'reviewThreshold':0.55,'trainTextHashes':[sha(texts[i]) for i in train],'corpusFingerprint':fingerprint,'trainSize':len(train),'testSize':len(test)}
    label_snapshot=[{'id':p['id'],'label':labels[p['id']]['label'],'status':labels[p['id']]['status'],'split':'test' if p['id'] in split['testIds'] else 'train'} for p in rows]
    label_hash=sha(json.dumps(label_snapshot,ensure_ascii=False,sort_keys=True))
    model['version']+='-'+label_hash[:8];model['labelFingerprint']=label_hash;report['labelFingerprint']=label_hash;report['corpusFingerprint']=fingerprint;report['modelVersion']=model['version'];model['evaluation']=report
    manifest={'corpusFingerprint':fingerprint,'labelFingerprint':label_hash,'labels':label_snapshot,'features':'post text only; no search term, URL, category or comments','split':split}
    save(ROOT/'models/intent-training.json',manifest)
    save(ROOT/'models/intent-report.json',report);save(ROOT/'models/intent-model.json',model)
    history=ROOT/'models/history'/model['version'];history.mkdir(parents=True,exist_ok=True)
    for name,value in [('model.json',model),('report.json',report),('training.json',manifest),('corpus.json',{'records':corpus})]:
        if not (history/name).exists(): save(history/name,value)
    parity_texts=list(texts[test][:10])+['ขอรีวิวน้ำพุแมว รุ่นไหนถอดล้างง่าย','ค่าตรวจที่คลินิกกี่บาท','แมวไม่กินอาหารทำอย่างไร','TEST  A\nB 🐈']
    save(ROOT/'models/intent-parity.json',[{'text':str(t),'featureCount':int(vec.transform([t]).nnz),'probabilities':trained.predict_proba([t])[0].tolist(),'classes':clf.classes_.tolist()} for t in parity_texts])
    (ROOT/'ml/requirements-lock.txt').write_text('\n'.join(p+'=='+version(p) for p in ['scikit-learn','numpy','scipy','joblib','threadpoolctl','narwhals','cloudpickle'])+'\n',encoding='utf-8')
    print(json.dumps({k:report[k] for k in ['labelStatus','used','trainSize','testSize','counts','macroF1','keywordBaselineMacroF1','trainOnlyCvMacroF1']},ensure_ascii=True))
if __name__=='__main__': main()
