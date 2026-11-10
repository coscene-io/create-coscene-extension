// worker-loader exports a constructor; the JavaScript entry runs only inside that worker.
declare const WorkerConstructor: new () => Worker;
export default WorkerConstructor;
