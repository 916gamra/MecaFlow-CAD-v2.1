export class GeometryWorker {
  private worker: Worker;

  constructor() {
    this.worker = new Worker(
      new URL('./geometry.worker.ts', import.meta.url),
      { type: 'module' }
    );
  }

  async calculateGeometry(params: Record<string, number>) {
    return new Promise((resolve, reject) => {
      this.worker.onmessage = (e) => resolve(e.data);
      this.worker.onerror = reject;
      this.worker.postMessage({ type: 'CALCULATE', params });
    });
  }
}
