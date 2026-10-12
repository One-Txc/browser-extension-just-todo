/** jsdom 无官方类型声明；测试 helper 只用构造器与 window，做最小声明即可 */
declare module 'jsdom' {
  export class JSDOM {
    constructor(html?: string, options?: { url?: string });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    window: any;
  }
}
