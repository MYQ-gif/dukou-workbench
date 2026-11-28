(function () {
  if (window.__dukouInquiryEntryV3Mounted) return;
  window.__dukouInquiryEntryV3Mounted = true;
  window.__dukouInquiryMode = false;

  const INQUIRY_PRESETS = [
    { label: "报价 & MOQ", text: "【买家询盘报价】买家询问价格与起订量，请结合目标国家交易习惯给出阶梯报价、MOQ及安全付款条件，买家原话：" },
    { label: "砍价 / 低定金博弈", text: "【付款条件与压价博弈】买家要求低定金、账期或大幅压价，请评估风险并给出不卑不亢的守底线回复，买家原话：" },
    { label: "OEM 定制打样", text: "【OEM/ODM定制沟通】请专业回复打样周期、开模费规则、Logo工艺及大货交期，买家原话：" },
    { label: "物流 & 清关交期", text: "【物流与清关沟通】请说明备货时效、贸易术语（FOB/CIF/DDP）及清关责任划分，买家原话：" },
    { label: "高情商催单跟进", text: "【未回复客户跟进】请写一封简短自然的 Follow-up 催单话术，引导买家推进确认，背景信息：" }
  ];

  const COUNTRY_RISK_DB = [
    {
      keys: ["印度", "India", "Mumbai", "Delhi", "Bangalore", "Chennai", "印商"],
      name: "印度 (India)",
      level: "高风险预警",
      risks: [
        "【低定金拖尾款 & 滞港拍卖套路】部分印度买家习惯只付 10%~20% 定金，货到目的港后故意拖延不付尾款，利用印度海关“超期未提货可低价拍卖且原发货人退运极难”的规则逼迫大幅降价。",
        "【付款方式陷阱】极易要求 D/P（付款交单）、O/A 赊销或带软条款的远期信用证（Far-dated L/C），到港后挑剔小瑕疵拒付。",
        "【低报关值与反复磨单】常要求低开发票金额（Under-invoicing）以逃避高关税，存在目的港扣货与收汇对不上账风险。"
      ],
      guardrail: "风控底线：坚持 100% 前 T/T；大额订单最低要求 50% 定金 + 见提单副本（B/L Copy）付清 50% 尾款后再寄正本提单或电放，绝不接受 D/P 与无保兑远期信用证。"
    },
    {
      keys: ["印尼", "印度尼西亚", "Indonesia", "Jakarta"],
      name: "印度尼西亚 (Indonesia)",
      level: "中高风险预警",
      risks: [
        "【强制认证与红灯期扣关】未提前确认 SNI / BPOM / POSTEL 等本土认证极易被海关扣押，且退运成本极高。",
        "【COD 拒收与汇率波动】电商与分销端 COD 拒收率偏高，印尼盾波动大，分销商常借汇率波动要求降价或延后结款。"
      ],
      guardrail: "风控底线：发货前务必与买家书面确认进口清关资质与税号（API/NPWP）；B2B 坚持定金+出货前全款。"
    },
    {
      keys: ["菲律宾", "泰国", "越南", "东南亚", "Philippines", "Thailand", "Vietnam", "SEA"],
      name: "东南亚市场 (SEA)",
      level: "常规风控提示",
      risks: [
        "【本土合规认证】泰国 TISI / FDA、菲律宾 BPS / FDA、越南合规标签未齐备易卡关。",
        "【小单试探与售后压价】中小卖家偏多，常以“先拿样品/小单测试，后续大单”为由要求免开模费或超低试单价。"
      ],
      guardrail: "风控底线：样品费与打样费实收（可约定大货返还），不轻易为口头大单承诺垫付开模成本。"
    },
    {
      keys: ["新加坡", "马来西亚", "Singapore", "Malaysia"],
      name: "新加坡 / 马来西亚 (SG/MY)",
      level: "稳健 · 注重合规与条款",
      risks: [
        "【转口贸易商压账期】部分本地贸易商实为转口商，会要求 30~60 天月结账期并层层压价。",
        "【安全与认证标识】马来西亚 SIRIM 认证、新加坡消费品安全标识（Safety Mark）及英文/马来文标签审查严格。"
      ],
      guardrail: "风控底线：首次合作不放账期（坚持前 T/T），报价前明确认证归属与起订量阶梯。"
    },
    {
      keys: ["中东", "阿联酋", "迪拜", "沙特", "UAE", "Dubai", "Saudi"],
      name: "中东市场 (Middle East)",
      level: "中高风险预警",
      risks: [
        "【先货后款与斋月回款慢】中东商人偏好赊销（O/A）与支票结算，且斋月及宗教节假日期间银行处理与清关大幅放缓。",
        "【单证与认证门槛】沙特 SABER/SCOC 认证、原产地证（CO）及发票使馆认证缺一不可，单证不符会导致无法清关。"
      ],
      guardrail: "风控底线：拒绝无保障赊销，至少 30%~50% 定金 + 见提单副本付清尾款；提前核对 SABER/CO 单证清单。"
    },
    {
      keys: ["美国", "北美", "加拿大", "USA", "US", "America"],
      name: "美国 / 北美 (North America)",
      level: "合规与售后风控",
      risks: [
        "【知识产权与 TRO 禁令】外观专利、商标词侵权极易触发平台下架或律师函冻结资金。",
        "【强制认证与高退货率】带电/接触人体类目需 FCC / UL / FDA 认证；信用卡 Chargeback 拒付与无理由退货成本高。"
      ],
      guardrail: "风控底线：合同明确质量验收标准与瑕疵容忍度，避免无上限售后连带赔偿条款。"
    },
    {
      keys: ["欧洲", "英国", "德国", "法国", "欧盟", "EU", "UK", "Europe"],
      name: "欧洲 / 英国 (EU / UK)",
      level: "合规与环保风控",
      risks: [
        "【CE / REACH / RoHS 与 EPR 环保法】欧盟对化学品限制、包装法（EPR）及 WEEE 回收注册抽检极严，不合规整批销毁或退运。",
        "【VAT 税务与 14 天退货】B2C/小B买家对 CE 符合性声明（DoC）与售后响应时效非常敏感。"
      ],
      guardrail: "风控底线：提前确认产品是否具备有效 CE/UKCA 检测报告，报价单注明不含目的国 VAT 与清关税费（FOB/EXW）。"
    },
    {
      keys: ["巴西", "墨西哥", "拉美", "南美", "Brazil", "Mexico"],
      name: "拉美市场 (LATAM)",
      level: "高清关风险预警",
      risks: [
        "【清关周期极长与高关税弃货】巴西海关清关常耗时 30~60 天，高额进口税常导致买家临时弃货。",
        "【税号与本土认证缺失】无有效进口商税号（如巴西 CNPJ）及 ANATEL/INMETRO 认证极易卡死在港口。"
      ],
      guardrail: "风控底线：发运前必须核验买家清关资质与税号，坚持出货前收齐 100% 货款。"
    },
    {
      keys: ["非洲", "尼日利亚", "肯尼亚", "南非", "Africa", "Nigeria"],
      name: "非洲市场 (Africa)",
      level: "高收汇风险预警",
      risks: [
        "【外汇管制与美金尾款难汇出】部分国家美金外汇紧缺，买家常以“银行换汇排队”为由无限期拖延尾款。",
        "【假水单与清关认证】偶发伪造银行转账水单催发货现象；尼日利亚等国需 SONCAP 强制清关证书。"
      ],
      guardrail: "风控底线：所有款项必须以美金实际到账银行账户为准（不看水单放货），坚持 100% 发货前全款到账。"
    }
  ];

  const LANG_LABELS = { en: "英文回信", zh: "中文回信", th: "泰语回信", vi: "越南语回信", es: "西语回信", ar: "阿语回信" };

  function esc(s) {
    return String(s ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
  }

  function getAsk() { return document.getElementById("ask"); }
  function getChatInner() { return document.querySelector("#chat .chat-inner") || document.getElementById("chat"); }

  function injectStyles() {
    if (document.getElementById("dukou-inquiry-style-v3")) return;
    const style = document.createElement("style");
    style.id = "dukou-inquiry-style-v3";
    style.textContent = `
      #btnInquiryMode {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        height: 32px;
        padding: 0 10px;
        border-radius: 4px;
        border: 1px solid rgba(255, 255, 255, 0.18);
        background: rgba(255, 255, 255, 0.05);
        color: #d6d3d1;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        white-space: nowrap;
        transition: all 0.16s ease;
        flex-shrink: 0;
      }
      #btnInquiryMode:hover { border-color: rgba(250, 204, 21, 0.6); color: #fef08a; }
      #btnInquiryMode.is-active {
        background: rgba(250, 204, 21, 0.2);
        border-color: #facc15;
        color: #fde047;
        box-shadow: 0 0 0 1px rgba(250, 204, 21, 0.28);
      }
      #inquiryChipsBar {
        display: none;
        align-items: center;
        flex-wrap: wrap;
        gap: 6px;
        padding: 6px 2px 8px;
      }
      #inquiryChipsBar.is-visible { display: flex; }
      .dukou-inq-tag {
        font-size: 11px;
        color: #facc15;
        background: rgba(250, 204, 21, 0.12);
        border: 1px solid rgba(250, 204, 21, 0.3);
        border-radius: 4px;
        padding: 2px 7px;
      }
      .dukou-inq-chip {
        font-size: 12px;
        color: #e7e5e4;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 999px;
        padding: 3px 10px;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .dukou-inq-chip:hover { border-color: #facc15; color: #fde047; background: rgba(250, 204, 21, 0.12); }
      .dukou-risk-radar {
        margin-bottom: 10px;
        padding: 10px 12px;
        border-radius: 6px;
        background: rgba(245, 158, 11, 0.1);
        border: 1px solid rgba(245, 158, 11, 0.42);
        color: #fef3c7;
        font-size: 12.5px;
        line-height: 1.6;
      }
      .dukou-risk-radar-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-weight: 600;
        color: #fbbf24;
        margin-bottom: 6px;
      }
      .dukou-risk-radar ul { margin: 0 0 6px 16px; padding: 0; }
      .dukou-risk-radar li { margin-bottom: 3px; }
      .dukou-risk-guardrail {
        padding-top: 6px;
        border-top: 1px dashed rgba(251, 191, 36, 0.32);
        color: #fde68a;
        font-weight: 500;
      }
      .dukou-inq-sec { margin-top: 10px; }
      .dukou-inq-sec h4 { margin: 0 0 4px; font-size: 13px; color: #facc15; }
      .dukou-inq-sec ul { margin: 0 0 6px 16px; padding: 0; font-size: 13px; line-height: 1.55; }
      .dukou-inq-reply-box {
        margin-top: 6px;
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 6px;
        padding: 8px 10px;
        background: rgba(255, 255, 255, 0.03);
      }
      .dukou-inq-reply-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 6px;
        font-size: 12px;
        color: #d6d3d1;
      }
      .dukou-inq-copy-btn {
        font-size: 11px;
        padding: 2px 8px;
        border-radius: 4px;
        border: 1px solid rgba(250, 204, 21, 0.45);
        background: rgba(250, 204, 21, 0.12);
        color: #fde047;
        cursor: pointer;
      }
      .dukou-inq-reply-box pre {
        margin: 0;
        white-space: pre-wrap;
        font-family: inherit;
        font-size: 13px;
        line-height: 1.6;
        color: #f5f5f4;
      }
    `;
    document.head.appendChild(style);
  }

  function classifyToolbarControls() {
    const ask = getAsk();
    if (!ask || !ask.parentElement) return { toFold: [], platformEl: null, countryEl: null };
    const bar = ask.parentElement;
    const toFold = [];
    let platformEl = null;
    let countryEl = null;

    const candidates = Array.from(bar.children).filter(
      (el) => el !== ask && el.id !== "btnSend" && el.id !== "btnInquiryMode"
    );

    const getControlText = (el) => {
      const sel = el.tagName === "SELECT" ? el : el.querySelector("select");
      if (sel) {
        const allOpts = Array.from(sel.options).map((o) => o.text).join(" ");
        const cur = sel.options[sel.selectedIndex]?.text || sel.value || "";
        return { cur: cur.trim(), all: allOpts };
      }
      const txt = (el.innerText || el.textContent || "").trim();
      return { cur: txt, all: txt };
    };

    for (const el of candidates) {
      const idClass = `${el.id || ""} ${el.className || ""}`.toLowerCase();
      const { cur, all } = getControlText(el);

      if (/图片|upload|file/.test(cur) || el.querySelector('input[type="file"]')) continue;

      if (el.id === "template" || idClass.includes("template") || /主图|详情页|营销|海报|展示图/.test(all)) {
        toFold.push(el);
        continue;
      }
      if (el.id === "imgCount" || idClass.includes("count") || /^\d+\s*张$/.test(cur) || /1\s*张|2\s*张|6\s*张/.test(all)) {
        toFold.push(el);
        continue;
      }
      if (
        el.querySelector("#btnLang") ||
        idClass.includes("lang") ||
        /英语|中文|日语|韩语|法语|德语|西班牙语|泰语|越南语|印尼语|马来语|阿拉伯语|English/i.test(all)
      ) {
        toFold.push(el);
        continue;
      }
      if (
        el.querySelector("#btnPlatform") ||
        idClass.includes("platform") ||
        /Shopee|Amazon|TikTok|Lazada|eBay|淘宝|京东|闲鱼/i.test(all)
      ) {
        platformEl = el;
        continue;
      }
      if (
        el.querySelector("#btnMarket") ||
        idClass.includes("market") ||
        idClass.includes("country") ||
        /新加坡|印度|美国|英国|欧洲|中东|日本|韩国|马来西亚|泰国|印尼|菲律宾|越南|巴西|目标市场/.test(all)
      ) {
        countryEl = el;
        continue;
      }
    }
    return { toFold, platformEl, countryEl };
  }

  function readPlatformAndCountry() {
    const pfName = document.getElementById("pfName")?.textContent?.trim();
    const mkName = document.getElementById("mkName")?.textContent?.trim();
    const { platformEl, countryEl } = classifyToolbarControls();
    const readEl = (el, fb) => {
      if (!el) return fb;
      const sel = el.tagName === "SELECT" ? el : el.querySelector("select");
      if (sel) return (sel.options[sel.selectedIndex]?.text || sel.value || fb).replace(/[▾▼]/g, "").trim();
      return (el.innerText || el.textContent || fb).replace(/[▾▼]/g, "").trim();
    };
    return {
      platform: pfName || readEl(platformEl, "跨境平台"),
      country: mkName || readEl(countryEl, "海外市场")
    };
  }

  function matchCountryRisk(selectedCountry, inquiryText) {
    for (const profile of COUNTRY_RISK_DB) {
      if (profile.keys.some((k) => new RegExp(k, "i").test(inquiryText))) return profile;
    }
    for (const profile of COUNTRY_RISK_DB) {
      if (profile.keys.some((k) => new RegExp(k, "i").test(selectedCountry))) return profile;
    }
    return {
      name: selectedCountry || "海外目标市场",
      level: "常规跨境风控",
      risks: [
        "【付款与交期模糊风险】首次合作买家若未明确付款比例（定金/尾款节点）与贸易术语（FOB/CIF/DDP），后期易产生额外费用争议。",
        "【目的港清关与合规】需提前核实目标国进口许可、产品认证及标签要求，避免目的港滞留产生仓租。"
      ],
      guardrail: "风控底线：首次合作建议坚持前 T/T（至少 30%~50% 定金 + 出货前/见提单副本付清尾款），报价单注明有效期与术语边界。"
    };
  }

  async function ensureValidProductId() {
    const prodSel = document.getElementById("prodSel");
    if (prodSel && prodSel.value) return prodSel.value;

    const listRes = await fetch("/api/products?limit=1");
    if (listRes.ok) {
      const listData = await listRes.json().catch(() => ({}));
      if (Array.isArray(listData.items) && listData.items.length > 0) {
        return listData.items[0].id;
      }
    }

    const createRes = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "外贸询盘客户",
        platform: "shopee",
        market: "sg",
        targetLangs: ["en"]
      })
    });
    const created = await createRes.json().catch(() => ({}));
    if (!createRes.ok || !created.id) {
      throw new Error(created?.error?.message || "无法自动创建询盘归属商品");
    }
    return created.id;
  }

  function scrollChatBottom() {
    const scroller = document.getElementById("chat");
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  }

  function appendUserBubble(text) {
    const container = getChatInner();
    if (!container) return;
    const el = document.createElement("div");
    el.className = "msg user";
    el.innerHTML = `<div class="bubble"><p style="white-space:pre-wrap;margin:0;">${esc(text)}</p></div>`;
    container.appendChild(el);
    scrollChatBottom();
  }

  function appendAssistantCard(platform, riskProfile) {
    const container = getChatInner();
    if (!container) return null;
    const el = document.createElement("div");
    el.className = "msg ai fresh";
    el.innerHTML = `
      <div class="avatar">渡</div>
      <div class="bubble">
        <div class="dukou-risk-radar">
          <div class="dukou-risk-radar-head">
            <span>🛡️ 国家贸易风控雷达 · ${esc(riskProfile.name)}（平台：${esc(platform)}）</span>
            <span>${esc(riskProfile.level)}</span>
          </div>
          <ul>${riskProfile.risks.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>
          <div class="dukou-risk-guardrail">${esc(riskProfile.guardrail)}</div>
        </div>
        <div class="dukou-inq-result">正在结合 ${esc(riskProfile.name)} 贸易风险特征解析询盘五要素并生成多语回信…</div>
      </div>
    `;
    container.appendChild(el);
    scrollChatBottom();
    return el.querySelector(".dukou-inq-result");
  }

  function renderInquiryResult(targetEl, r) {
    if (!targetEl) return;
    const fields = Array.isArray(r.fields) ? r.fields : [];
    const risks = Array.isArray(r.risks) ? r.risks : [];
    const tiers = Array.isArray(r.tiers) ? r.tiers : [];
    const replies = Object.entries(r.reply || {}).filter(([, v]) => v);

    targetEl.innerHTML = `
      ${fields.length ? `<div class="dukou-inq-sec"><h4>📋 询盘核心要素</h4><ul>${fields.map((f) => `<li>${esc(f.label)}：<b>${esc(f.value)}</b></li>`).join("")}</ul></div>` : ""}
      ${tiers.length ? `<div class="dukou-inq-sec"><h4>💰 阶梯报价参考</h4><ul>${tiers.map((t) => `<li>${esc(t.qty)} 件 · ${esc(t.unit)}</li>`).join("")}</ul></div>` : ""}
      ${risks.length ? `<div class="dukou-inq-sec"><h4>⚠️ 针对本单的风险研判</h4><ul>${risks.map((x) => `<li><span class="tag">${x.level === "warn" ? "高危" : "提示"}</span> ${esc(x.text)}</li>`).join("")}</ul></div>` : ""}
      ${replies.length ? `<div class="dukou-inq-sec"><h4>✉️ 可直接发送的回信</h4>${replies.map(([lang, text], idx) => `
        <div class="dukou-inq-reply-box">
          <div class="dukou-inq-reply-head">
            <span>${esc(LANG_LABELS[lang] || lang.toUpperCase())}</span>
            <button type="button" class="dukou-inq-copy-btn" data-copy-idx="${idx}">复制回信</button>
          </div>
          <pre>${esc(text)}</pre>
        </div>`).join("")}</div>` : ""}
      ${r.note ? `<p class="muted-sm" style="margin-top:8px;">${esc(r.note)} · 已自动存入仓库「文字」</p>` : ""}
    `;

    targetEl.querySelectorAll(".dukou-inq-copy-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const pre = btn.closest(".dukou-inq-reply-box")?.querySelector("pre");
        if (!pre) return;
        try {
          await navigator.clipboard.writeText(pre.textContent || "");
          btn.textContent = "已复制";
          setTimeout(() => (btn.textContent = "复制回信"), 1400);
        } catch {
          btn.textContent = "复制失败";
        }
      });
    });
    scrollChatBottom();
  }

  async function pollInquiryJob(jobId, targetEl) {
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const res = await fetch(`/api/jobs/${jobId}`);
      const job = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(job?.error?.message || `查询任务失败 (${res.status})`);
      if (job.status === "done") {
        renderInquiryResult(targetEl, job.result || {});
        return;
      }
      if (job.status === "failed") {
        throw new Error(job?.error?.message || "询盘解析任务失败");
      }
    }
    throw new Error("询盘解析超时，请稍后重试");
  }

  async function submitInquiry() {
    const ask = getAsk();
    if (!ask) return;
    const rawPrompt = ask.value.trim();
    if (!rawPrompt) return;

    const { platform, country } = readPlatformAndCountry();
    const riskProfile = matchCountryRisk(country, rawPrompt);

    ask.value = "";
    ask.style.height = "auto";

    appendUserBubble(`📩 [询盘风控 · 平台：${platform} | 国家：${riskProfile.name}]\n${rawPrompt}`);
    const resultEl = appendAssistantCard(platform, riskProfile);

    // 把国别风险背景拼进 params.text，让后端 liveInquiry 与 mockInquiry 都能吃到完整上下文
    const enrichedText = [
      `[平台: ${platform} | 目标国家/地区: ${riskProfile.name}]`,
      `[该国重点贸易风险参考: ${riskProfile.risks.join("；")} | ${riskProfile.guardrail}]`,
      `买家询盘原文：`,
      rawPrompt
    ].join("\n");

    try {
      const productId = await ensureValidProductId();
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "inquiry",
          productId,
          params: {
            text: enrichedText,
            langs: ["en", "zh"],
            platform,
            market: riskProfile.name
          }
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
      if (!data.jobId) throw new Error("后端未返回 jobId");
      await pollInquiryJob(data.jobId, resultEl);
    } catch (err) {
      if (resultEl) {
        resultEl.innerHTML = `<p class="err" style="margin:0;">询盘解析失败：${esc(err.message || err)}</p>`;
      }
    }
  }

  let foldedElements = [];
  let savedPlaceholder = "";

  function setInquiryMode(active) {
    const ask = getAsk();
    const btnInquiry = document.getElementById("btnInquiryMode");
    const chipsBar = document.getElementById("inquiryChipsBar");
    if (!ask || !btnInquiry || !chipsBar) return;

    window.__dukouInquiryMode = !!active;
    btnInquiry.classList.toggle("is-active", window.__dukouInquiryMode);
    chipsBar.classList.toggle("is-visible", window.__dukouInquiryMode);

    if (window.__dukouInquiryMode) {
      savedPlaceholder = ask.getAttribute("placeholder") || savedPlaceholder;
      const { toFold } = classifyToolbarControls();
      foldedElements = toFold;
      foldedElements.forEach((el) => {
        if (el.dataset.dukouOrigDisplay === undefined) {
          el.dataset.dukouOrigDisplay = el.style.display || "";
        }
        el.style.display = "none";
      });
      ask.setAttribute("placeholder", "粘贴海外买家询盘原文（自动结合所选国家与平台分析收款/清关风险并生成中英回信）…");
      ask.focus();
    } else {
      foldedElements.forEach((el) => {
        el.style.display = el.dataset.dukouOrigDisplay || "";
        delete el.dataset.dukouOrigDisplay;
      });
      foldedElements = [];
      if (savedPlaceholder) ask.setAttribute("placeholder", savedPlaceholder);
    }
  }

  function mount() {
    const ask = getAsk();
    if (!ask || !ask.parentElement || document.getElementById("btnInquiryMode")) return;

    injectStyles();

    const btnInquiry = document.createElement("button");
    btnInquiry.id = "btnInquiryMode";
    btnInquiry.type = "button";
    btnInquiry.title = "切换询盘风控与回复模式（自动折叠语言与生图类型，仅保留平台与国家）";
    btnInquiry.innerHTML = "<span>📩</span><span>询盘</span>";
    ask.parentElement.insertBefore(btnInquiry, ask);

    const chipsBar = document.createElement("div");
    chipsBar.id = "inquiryChipsBar";
    const badge = document.createElement("span");
    badge.className = "dukou-inq-tag";
    badge.textContent = "询盘风控模式";
    chipsBar.appendChild(badge);

    INQUIRY_PRESETS.forEach((item) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "dukou-inq-chip";
      chip.textContent = item.label;
      chip.addEventListener("click", () => {
        const curAsk = getAsk();
        if (!curAsk) return;
        curAsk.value = item.text;
        curAsk.focus();
      });
      chipsBar.appendChild(chip);
    });

    const rowParent = ask.parentElement.parentElement || ask.parentElement;
    rowParent.insertBefore(chipsBar, ask.parentElement);

    btnInquiry.addEventListener("click", () => setInquiryMode(!window.__dukouInquiryMode));
  }

  // 全局捕获委托：即使 app.js 稍后把 #ask 从 input 替换为 textarea，拦截依然 100% 生效
  document.addEventListener("click", (e) => {
    if (!window.__dukouInquiryMode) return;
    if (e.target.closest("#btnSend")) {
      e.preventDefault();
      e.stopImmediatePropagation();
      submitInquiry();
      return;
    }
    if (e.target.closest(".tile, [data-template]")) {
      setInquiryMode(false);
    }
  }, true);

  document.addEventListener("keydown", (e) => {
    if (!window.__dukouInquiryMode) return;
    if (e.target && e.target.id === "ask" && e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      e.stopImmediatePropagation();
      submitInquiry();
    }
  }, true);

  // 延迟到 module 脚本（app.js）完成 DOM 升级后再挂载按钮
  function bootMount() {
    mount();
    setTimeout(mount, 180);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootMount);
  } else {
    bootMount();
  }
})();
