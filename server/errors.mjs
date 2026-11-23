export const workflowError=(message,statusCode=400)=>Object.assign(Error(message),{statusCode});
