import type { Repo } from './store.ts';

/**
 * 首次安装的示例数据：用几条「功能介绍」任务把玩法演示一遍，打开就有东西可看可点。
 * 这是随安装播种的演示数据而非界面文案，标题直接写中文，不走语言包。
 * id 固定用 seed_ 前缀，与 newId() 的 `前缀_时间戳_计数` 格式不会撞车，
 * 两个页面同时首启时写入的内容也完全一致（后写覆盖先写，不会重复）。
 * 首次检测与写入在 createContext 里完成，这里只负责构造，不碰 storage。
 */
export function buildSeedRepo(): Repo {
  const base = Date.now();
  const ago = (minutes: number): number => base - minutes * 60_000;

  const guide = 'seed_g1';
  const daily = 'seed_g2';

  return {
    version: 1,
    groups: [
      { id: guide, name: '上手指南', createdAt: ago(60) },
      { id: daily, name: '日常示例', createdAt: ago(59) },
    ],
    tasks: [
      { id: 'seed_t1', title: '欢迎使用 Just Todo！这条示例清单会带你快速上手', done: false, gid: guide, createdAt: ago(50), completedAt: null, order: 0 },
      { id: 'seed_t2', title: '点任务左侧的圆圈，把它标记为完成 —— 试试看', done: false, gid: guide, createdAt: ago(49), completedAt: null, order: 1 },
      { id: 'seed_t3', title: '双击任意任务的文字，可以直接编辑内容', done: false, gid: guide, createdAt: ago(48), completedAt: null, order: 2 },
      { id: 'seed_t4', title: '按住任务文字右侧的空白处拖动，可以调整顺序', done: false, gid: guide, createdAt: ago(47), completedAt: null, order: 3 },
      { id: 'seed_t5', title: '在上面的输入框输入文字，按回车就能添加新任务', done: false, gid: guide, createdAt: ago(46), completedAt: null, order: 4 },
      { id: 'seed_t6', title: '点右上角的齿轮按钮打开设置，可以更换主题和语言', done: false, gid: guide, createdAt: ago(45), completedAt: null, order: 5 },
      { id: 'seed_t7', title: '按 Ctrl+T 打开新标签页试试 —— 新标签页已被这份清单接管，可在设置「接管空白标签页」中开启', done: false, gid: guide, createdAt: ago(44), completedAt: null, order: 6 },
      { id: 'seed_t8', title: '整理浏览器书签', done: false, gid: daily, createdAt: ago(40), completedAt: null, order: 7 },
      { id: 'seed_t9', title: '回复上周没来得及看的邮件', done: false, gid: daily, createdAt: ago(39), completedAt: null, order: 8 },
      // 已完成任务：order 0 在最上面（done 列表按 order 升序，与「最新完成在前」一致）
      { id: 'seed_t10', title: '这就是完成后的样子：文字置灰并显示删除线', done: true, gid: guide, createdAt: ago(38), completedAt: ago(30), order: 0 },
      { id: 'seed_t11', title: '再点一次圆圈恢复为待办，或点右侧的归档按钮收进归档区', done: true, gid: guide, createdAt: ago(37), completedAt: ago(29), order: 1 },
    ],
    // archivedAt 越大越靠前显示：第一条演示文案排在归档区最上面
    archived: [
      { id: 'seed_a1', title: '归档的任务都保存在这里，用上方搜索框可以按标题或分组名查找', gid: guide, groupName: '上手指南', archivedAt: ago(20) },
      { id: 'seed_a2', title: '删除分组后，归档记录仍会保留归档时的分组名', gid: guide, groupName: '上手指南', archivedAt: ago(19) },
      { id: 'seed_a3', title: '没有分组的任务归档后，分组名会显示为「未分组」', gid: null, groupName: null, archivedAt: ago(18) },
    ],
  };
}
