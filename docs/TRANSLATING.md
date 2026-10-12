# 翻译指南

## 文件位置

```
_locales/zh_CN/messages.json   ← 基准（文案原始出处，只维护这一份）
_locales/en/messages.json      ← 英文
```

## 条目格式

```json
"keyName": {
  "message": "显示文案",
  "description": "给译者的说明：这条用在哪个位置"
}
```

- `message` 必填，不能为空字符串。
- `description` 建议必填，帮助译者理解上下文。
- 字段只允许 `message` / `description` / `placeholders`；多余字段会被 `check-locales.py` 判为问题。

## 占位符

沿用 Chrome 语法，从 `$1` 开始顺序编号：

```json
"archiveFootLimited": {
  "message": "显示最近 $1 条，共 $2 条归档 — 在搜索框输入关键词可查找更早的任务",
  "description": "归档超显示条数时的底部说明，$1=显示数 $2=总数"
}
```

调用侧：`t('archiveFootLimited', [String(visible), String(total)])`。

**同一 key 在不同语言里的占位符数量必须一致**，否则 `check-locales.py` 会给出警告。

## 回退行为

`t(key)` 的查找顺序：

1. 当前语言表（手动选定则用它，`auto` 时按 `chrome.i18n.getUILanguage()` 映射：`en*` → `en`，其余 → `zh_CN`）
2. `chrome.i18n.getMessage(key)`（浏览器原生）
3. `zh_CN` 表
4. key 本身（用于一眼发现漏翻）

因此**英文缺失时不会显示空白**，而是回退到中文；这也意味着漏翻要主动靠 `npm run check:locales` 发现。

## 校验

```bash
npm run check:locales
```

- **失败（阻塞）**：基准文件的 JSON 语法错误、空 `message`、缺 `message` 字段、非法字段。
- **警告（不阻塞）**：其他语言相对基准的缺 key / 多 key / 占位符数量不符。
