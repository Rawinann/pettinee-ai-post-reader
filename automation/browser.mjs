import {extractVisiblePosts,sourcePageState} from './extract.mjs';
export function createBrowserReader(page,config){
 let feedOrder='unverified';
 const args={groupId:config.groupId,messageSelector:config.messageSelector,limit:config.maxPosts};
 return {
  gate:()=>page.evaluate(sourcePageState,{groupId:config.groupId}),
  order:()=>feedOrder,
  async beginBatch(){await page.evaluate(()=>window.scrollTo(0,0));},
  async readBatchView({excludeIds=[],limit=config.maxPosts}={}){await this.expand();return page.evaluate(extractVisiblePosts,{...args,excludeIds,limit});},
  async scrollBatch(){await page.evaluate(()=>window.scrollBy(0,Math.round(window.innerHeight*.8)));await page.waitForTimeout(1500);},
  async preferNewPosts(){
   feedOrder='unverified';
   const sorter=page.getByRole('button',{name:/เรียงลำดับฟีดในกลุ่มตาม|Sort group feed by/i}).first();
   try{
    await sorter.waitFor({state:'visible',timeout:10000});
    if(/โพสต์ใหม่|New posts/i.test(await sorter.innerText())){feedOrder='new_posts';return true;}
    await sorter.click({timeout:5000});
    const option=page.getByText(/^(โพสต์ใหม่(?:ล่าสุด)?|New posts)$/i).first();
    await option.waitFor({state:'visible',timeout:5000});
    await option.click({timeout:5000});
    await sorter.filter({hasText:/โพสต์ใหม่|New posts/i}).waitFor({state:'visible',timeout:5000});
    feedOrder='new_posts';return true;
   }catch{await page.keyboard.press('Escape').catch(()=>{});return false;}
  },
  async expand(){
   // Only a post-body's See more control; never comments/replies/composers.
   const messages=page.locator('[data-ad-preview="message"],[data-ad-comet-preview="message"],[data-ad-rendering-role="story_message"]');
   for(let i=0;i<12;i++){
    const button=messages.getByRole('button',{name:/^(ดูเพิ่มเติม|See more)$/i}).first();
    if(!await button.count()||!await button.isVisible())break;
    try{await button.click({timeout:2500});}catch{break;}
   }
  },
  async scan({scroll=false}={}){
   const posts=new Map(),stats={articles:0,skipped:{noPermalink:0,noMessage:0,oversized:0},selectorError:false};
   if(scroll)await page.evaluate(()=>window.scrollTo(0,0));
   for(let step=0;step<=(scroll?config.maxScrolls:0);step++){
    if(await this.gate()!=='ready')break;
    await this.expand();
    const result=await page.evaluate(extractVisiblePosts,args);
    stats.articles+=result.articles;stats.selectorError ||= result.selectorError;
    for(const key of Object.keys(stats.skipped))stats.skipped[key]+=result.skipped[key];
    for(const p of result.posts)if(!posts.has(p.externalId))posts.set(p.externalId,p);
    if(posts.size>=config.maxPosts||result.selectorError)break;
    if(scroll&&step<config.maxScrolls){await page.evaluate(()=>window.scrollBy(0,Math.round(window.innerHeight*.8)));await page.waitForTimeout(1000);}
   }
   return {...stats,posts:[...posts.values()].slice(0,config.maxPosts)};
  },
 };
}
