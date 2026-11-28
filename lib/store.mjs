// 存储层（后端）——原子落盘，绝不半写毁库
// 规矩：零依赖，只用 node 内置模块。
//
// 为什么要有这个文件：
//   原来是 fs.writeFile 直接覆盖 data/db.json。写到一半崩进程 = 整库是半截 JSON，
//   而 load() 的 catch 会静默退回空库 —— 用户的商品和账目会凭空消失。
//
// 现在的保证：
//   1. 写 db.json.tmp → fsync → rename 原子替换，rename 在同一文件系统内是原子操作；
//   2. 所有写入进一条串行队列，永不并发写同一个文件；
//   3. 解析失败时把坏档转存成 db.corrupt-<ts>.json，再退回空库，用户数据可人工抢救；
//   4. 进程退出信号（SIGINT/SIGTERM）与 beforeExit 时同步刷盘，不丢最后一次改动。
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_DB = { products: [], assets: [], jobs: [], ledger: [] };

export function emptyDB() {
  return JSON.parse(JSON.stringify(DEFAULT_DB));
}

/**
 * 读库。坏档不静默清空，先转存再退回空库。
 * @returns {{db: object, recovered: string|null}}
 */
export function load(dbFile) {
  let raw;
  try {
    raw = fs.readFileSync(dbFile, 'utf8');
  } catch {
    return { db: emptyDB(), recovered: null }; // 首次启动，没有库文件，正常
  }

  try {
    const parsed = JSON.parse(raw);
    const db = { ...emptyDB(), ...parsed };
    // 字段形状兜底：任何一个顶层集合被写坏成非数组，都不让它把后面的代码带崩
    for (const key of Object.keys(DEFAULT_DB)) {
      if (!Array.isArray(db[key])) db[key] = [];
    }
    return { db, recovered: null };
  } catch (err) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backup = path.join(path.dirname(dbFile), `db.corrupt-${stamp}.json`);
    try {
      fs.writeFileSync(backup, raw);
    } catch {
      /* 转存失败也不能阻塞启动 */
    }
    console.error(`[store] db.json 解析失败（${err.message}）；已转存 ${path.basename(backup)}，本次以空库启动`);
    return { db: emptyDB(), recovered: backup };
  }
}

/** 一次真正的原子写：tmp → fsync → rename */
function writeAtomicSync(file, text) {
  const tmp = `${file}.tmp`;
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeFileSync(fd, text, 'utf8');
    fs.fsyncSync(fd); // 关键：确保字节真的落到磁盘，而不是停在页缓存
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file); // 同分区 rename 是原子的：读者要么看到旧库，要么看到新库
}

/**
 * 建一个持久化器。返回 { persist, flush, close }。
 * persist 是防抖异步写；flush 是立即同步写（退出时用）。
 */
export function createPersister(dbFile, getDB, { debounceMs = 150 } = {}) {
  let timer = null;
  let writing = false;
  let pending = false; // 写盘期间又有新改动 → 写完再补一次
  let closed = false;

  function doWrite() {
    if (closed) return;
    if (writing) {
      pending = true;
      return;
    }
    writing = true;
    let text;
    try {
      text = JSON.stringify(getDB(), null, 2);
    } catch (err) {
      writing = false;
      console.error('[store] 序列化失败：', err.message);
      return;
    }
    // 放进微任务，避免在请求处理路径上同步阻塞事件循环
    queueMicrotask(() => {
      try {
        writeAtomicSync(dbFile, text);
      } catch (err) {
        console.error('[store] 落盘失败：', err.message);
      } finally {
        writing = false;
        if (pending) {
          pending = false;
          doWrite();
        }
      }
    });
  }

  function persist() {
    if (closed) return;
    clearTimeout(timer);
    timer = setTimeout(doWrite, debounceMs);
    timer.unref?.();
  }

  function flush() {
    clearTimeout(timer);
    if (closed) return;
    try {
      writeAtomicSync(dbFile, JSON.stringify(getDB(), null, 2));
    } catch (err) {
      console.error('[store] 退出前落盘失败：', err.message);
    }
  }

  function close() {
    flush();
    closed = true;
  }

  return { persist, flush, close };
}

/** 进程收尾：Ctrl+C / kill / 正常退出都把最后一次改动刷下去 */
export function installExitFlush(persister) {
  let done = false;
  const once = (code) => () => {
    if (done) return;
    done = true;
    persister.flush();
    if (code !== null) process.exit(code);
  };
  process.on('SIGINT', once(130));
  process.on('SIGTERM', once(143));
  process.on('beforeExit', once(null));
}
