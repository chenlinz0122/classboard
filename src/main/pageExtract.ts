/**
 * 雨课堂等 SPA 的页面作业扫描器。
 * 目标是“宁可少抓、不要抓错”：只从当前页面可见的卡片里找标题和截止时间，
 * 结果必须由用户确认后才入库。
 */
export function buildAssignmentScanScript(): string {
  return String.raw`(async () => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const normalize = (value) => String(value || '').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
    const oneLine = (value) => normalize(value).replace(/\s+/g, ' ').trim();
    const dateRe = /(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}月\d{1,2}日?|\d{1,2}[-/]\d{1,2}(?!\d)|今天|明天|后天|周[一二三四五六日]|星期[一二三四五六日]|\d{1,2}:\d{2}|剩余|截止|Deadline)/i;
    const keyRe = /(作业|任务|题目集|题集|练习|截止|提交|未提交|待完成|已完成|已提交|已批阅|剩余|homework|assignment)/i;
    const statusOnlyRe = /^(未提交|待完成|已完成|已提交|已批阅|未开始|进行中|去完成|查看详情|已截止|已过期)$/;
    const dueLineRe = /(截止|Deadline|剩余|还有|已截止|\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}月\d{1,2}日?|今天|明天|后天|周[一二三四五六日]|星期[一二三四五六日]|\d{1,2}:\d{2})/i;

    const originalY = window.scrollY;
    try {
      for (let step = 1; step <= 4; step += 1) {
        window.scrollTo(0, Math.round(document.body.scrollHeight * step / 4));
        await sleep(260);
      }
      window.scrollTo(0, originalY);
      await sleep(180);
    } catch (_) {}

    const selectors = [
      'article',
      'li',
      'section',
      '[class*="homework" i]',
      '[class*="assignment" i]',
      '[class*="work" i]',
      '[class*="task" i]',
      '[class*="todo" i]',
      '[class*="card" i]'
    ];
    const nodes = Array.from(document.querySelectorAll(selectors.join(','))).slice(0, 4000);
    const candidates = [];

    const pickTitle = (el, text, dueText) => {
      const heading = el.querySelector('h1,h2,h3,h4,h5,h6,[class*="title" i],[class*="name" i],strong,b');
      if (heading) {
        const value = oneLine(heading.innerText || heading.textContent);
        if (value.length >= 2 && value.length <= 120 && !statusOnlyRe.test(value) && !/^\d{1,2}:\d{2}/.test(value)) {
          return value;
        }
      }
      const lines = text.split('\n').map(oneLine).filter(Boolean);
      for (const line of lines) {
        if (line.length < 2 || line.length > 160) continue;
        if (statusOnlyRe.test(line)) continue;
        if (dateRe.test(line) && line.length < 20) continue;
        if (/^(作业|任务)$/i.test(line)) continue;
        let title = line
          .replace(/^作业名称\s*[:：]?\s*/, '')
          .replace(/^任务名称\s*[:：]?\s*/, '')
          .replace(/\s*(截止(?:时间)?\s*[:：]?.*)$/i, '')
          .trim();
        if (dueText && title.includes(dueText)) title = title.replace(dueText, '').trim();
        if (title.length >= 2 && title.length <= 160) return title;
      }
      return '';
    };

    const pickDue = (text) => {
      const lines = text.split('\n').map(oneLine).filter(Boolean);
      for (const line of lines) {
        if (!dueLineRe.test(line)) continue;
        if (/^作业\s*$/.test(line)) continue;
        if (line.length <= 100) return line;
        const match = line.match(/(?:截止(?:时间|日期)?\s*[:：]?\s*[^，,。;；]{2,60}|剩余[^，,。;；]{1,40}|\d{4}[-/.]\d{1,2}[-/.]\d{1,2}[^，,。;；]{0,20}|\d{1,2}月\d{1,2}日?[^，,。;；]{0,20}|\d{1,2}:\d{2})/);
        if (match) return match[0].trim();
      }
      return '';
    };

    const pickCourse = (el) => {
      let node = el;
      for (let depth = 0; node && depth < 5; depth += 1) {
        const found = node.querySelector('[class*="course" i], [class*="class-name" i]');
        if (found) {
          const value = oneLine(found.innerText || found.textContent).replace(/^课程\s*[:：]?\s*/, '');
          if (value.length >= 2 && value.length <= 64) return value;
        }
        node = node.parentElement;
      }
      return '';
    };

    for (const el of nodes) {
      if (!(el instanceof HTMLElement)) continue;
      const text = normalize(el.innerText || el.textContent);
      if (!text || text.length < 8 || text.length > 1400) continue;
      if (!keyRe.test(text) || !dateRe.test(text)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 100 || rect.height < 22) continue;
      if (rect.width > window.innerWidth * 0.98 && rect.height > window.innerHeight * 0.8) continue;
      if (el.querySelectorAll('li,article,section').length > 4) continue;

      const className = String(el.className || '');
      let score = 0;
      if (/截止|Deadline/i.test(text)) score += 5;
      if (/作业|homework|assignment/i.test(text)) score += 3;
      if (dateRe.test(text)) score += 2;
      if (/homework|assignment|work|task|todo|card/i.test(className)) score += 2;
      if (el.querySelector('h1,h2,h3,h4,h5,h6')) score += 1;
      if (el.tagName === 'LI') score += 1;
      if (text.length > 700) score -= 2;
      if (score < 4) continue;

      const dueText = pickDue(text);
      const title = pickTitle(el, text, dueText);
      if (!title) continue;
      const link = el.querySelector('a[href]');
      const href = link && link.href ? link.href : location.href;
      const completed = /已完成|已提交|已批阅|已结束/.test(text);
      candidates.push({
        title,
        dueText,
        courseName: pickCourse(el),
        sourceUrl: href,
        statusText: completed ? '已完成' : /未提交|待完成|未开始/.test(text) ? '未提交' : '',
        completed,
        score,
        textLength: text.length
      });
    }

    candidates.sort((a, b) => b.score - a.score || a.textLength - b.textLength);
    const seen = new Set();
    const items = [];
    for (const candidate of candidates) {
      const dedupe = oneLine(candidate.title) + '|' + oneLine(candidate.dueText);
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      items.push(candidate);
      if (items.length >= 80) break;
    }

    return {
      items: items.map(({ score, textLength, ...rest }) => rest),
      title: document.title,
      url: location.href,
      warning: items.length === 0
        ? '未在当前页面识别到作业。请确认已进入课程的“作业/待办”列表并等待页面加载完成。'
        : ''
    };
  })()`
}
