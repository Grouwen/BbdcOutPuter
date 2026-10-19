/**
 * 把后端 Word 对象（含 ultimate 词典信息）整理成界面与 PDF 需要的形状。
 * 数据结构见 app/domain/word.py 与 app/domain/ultimate_result.py。
 */

/** 合并中文释义：优先 translation，退化为 definition；与 PDF 单行文本约定一致 */
export function meaningOf(word) {
  const ultimate = word?.ultimate || {};
  const translation = (ultimate.translation || []).filter(Boolean);
  if (translation.length) return translation.join('；');
  const definition = (ultimate.definition || []).filter(Boolean);
  if (definition.length) return definition.join('；');
  return '';
}

/** 音标：优先美音，其次英音，再次词典 phonetic */
export function phoneticOf(word) {
  const ultimate = word?.ultimate || {};
  const value = word?.uspron || word?.ukpron || ultimate.phonetic || '';
  return value ? `/${value}/` : '';
}

/** 拆出词性，便于高亮显示 */
export function definitionsOf(word) {
  const ultimate = word?.ultimate || {};
  const lines = (ultimate.translation || []).filter(Boolean);
  const source = lines.length ? lines : (ultimate.definition || []).filter(Boolean);
  return source.map((line) => {
    const match = String(line).match(/^((?:adj|adv|n|v|vt|vi|prep|conj|pron|art|num|int|aux)\.)\s*(.*)$/i);
    if (match) return { pos: match[1].toLowerCase(), text: match[2] };
    return { pos: '', text: String(line) };
  });
}

/** 标签：柯林斯星级、牛津核心、考试标签 */
export function tagsOf(word) {
  const ultimate = word?.ultimate || {};
  const tags = [];
  if (ultimate.oxford) tags.push({ text: '牛津核心', hot: true });
  if (ultimate.collins > 0) tags.push({ text: `柯林斯 ${'★'.repeat(Math.min(5, ultimate.collins))}`, hot: true });
  for (const tag of ultimate.tag || []) {
    if (tag) tags.push({ text: String(tag), hot: false });
  }
  return tags.slice(0, 5);
}

/** 音频地址（后端返回的是外链字符串，直接交给 <audio>） */
export function audioOf(word) {
  return word?.ultimate?.audio || '';
}
