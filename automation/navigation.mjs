// A login/redirect replaces the document while evaluate() is in flight. This is
// a normal transition, not a reason to close the operator's browser window.
export function isNavigationTransition(error){return /Execution context was destroyed|Cannot find context with specified id|Cannot find execution context|frame was detached|net::ERR_ABORTED/i.test(String(error?.message||''));}
export async function runBrowserCycle(operation,{isClosed=()=>false,onTransition=async()=>{}}={}){
 try{await operation();return {kind:'ok'};}
 catch(error){if(isClosed())return {kind:'closed'};if(!isNavigationTransition(error))throw error;await onTransition();return {kind:'navigation'};}
}
