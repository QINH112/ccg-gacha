declare function App(options: any): void;
declare function Page(options: any): void;
declare const wx: any;
declare namespace WechatMiniprogram {
  interface TouchEvent {
    currentTarget: { dataset: Record<string, any> };
  }
}
