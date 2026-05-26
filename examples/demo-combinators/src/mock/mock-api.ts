export interface ApiMarker {
 widget: string;
 completed: boolean;
 aborted: boolean;
}

export class MockApiMarker {
 private markers: ApiMarker[] = [];

 loadWidget(name: string, delay: number): Promise<string> {
 return new Promise((resolve, reject) => {
 const timeout = setTimeout(() => {
 this.markers.push({ widget: name, completed: true, aborted: false });
 resolve(name);
 }, delay);

 const abort = () => {
 clearTimeout(timeout);
 this.markers.push({ widget: name, completed: false, aborted: true });
 reject(new Error(`Widget ${name} canceled`));
 };

 (resolve as any)._abort = abort;
 (reject as any)._abort = abort;
 });
 }

 getMarkers(): ApiMarker[] {
 return [...this.markers];
 }

 reset(): void {
 this.markers = [];
 }
}
