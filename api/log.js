// api/log.js  (moulin-r-chatbot / Vercel, CommonJS)
//
// 【この版の考え方】
// 今まで通りの保存（シンプルな4項目データベースへのページ作成・追記）は
// 一切変更せず、その処理が終わった直後に、新しい「Rena管理用データベース」
// （複数サロンをまとめる14項目のデータベース）へも1行追加で書き込みます。
// フロントエンド（チャット画面）側の変更は不要です。
//
// 【既存のまま使う環境変数】(変更しない)
//   NOTION_API_KEY      … 今まで通りのNotion統合キー
//   NOTION_DATABASE_ID  … 今まで通りのシンプルなデータベースのID
//   ANTHROPIC_API_KEY   … Renaの返信にも使っているAnthropicのAPIキー（要約生成にも流用）
//
// 【新しく追加する環境変数】
//   NOTION_API_KEY_HQ      … 「Rena 本部管理」統合のシークレットキー
//   NOTION_DATABASE_ID_HQ  … 「Rena管理用データベース」のID (3dab765d003480e29830c59329b84a65)
//   SALON_NAME             … 店舗名として記録する文字列。未設定なら"Moulin-R"
//
// 新しい方(HQ)の書き込みが失敗しても、今まで通りの保存やチャット表示には一切影響しません。

const NOTION_VERSION = "2022-06-28";
const ANTHROPIC_VERSION = "2023-06-01";
const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";

const CATEGORY_OPTIONS = [
  "ヘアケア・髪の悩み",
  "メニュー・施術",
  "料金",
  "予約・来店",
  "商品・店販",
  "その他",
];

function chunkText(text, size = 1900) {
  const str = String(text ?? "");
  const chunks = [];
  for (let i = 0; i < str.length; i += size) {
    chunks.push(str.slice(i, i + size));
  }
  return chunks.length > 0 ? chunks : [""];
}

function toRichText(text) {
  return chunkText(text).map((chunk) => ({
    type: "text",
    text: { content: chunk },
  }));
}

function buildTurnBlocks(turnCount, userMessage, assistantMessage) {
  return [
    {
      object: "block",
      type: "heading_3",
      heading_3: {
        rich_text: [{ type: "text", text: { content: `ターン ${turnCount}` } }],
      },
    },
    {
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: toRichText(`👤 お客様: ${userMessage}`),
      },
    },
    {
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: toRichText(`🌸 Rena: ${assistantMessage}`),
      },
    },
    {
      object: "block",
      type: "divider",
      divider: {},
    },
  ];
}

// ============================================================
// ここから下 = 今まで通りの処理（一切変更なし）
// ============================================================
async function writeLegacyLog({ name, pageId, userMessage, assistantMessage, turnCount, isFinal }) {
  const NOTION_API_KEY = process.env.NOTION_API_KEY;
  const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;

  if (!NOTION_API_KEY || !NOTION_DATABASE_ID) {
    return { ok: false, reason: "not_configured" };
  }

  const notionHeaders = {
    Authorization: `Bearer ${NOTION_API_KEY}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };

  try {
    if (!pageId) {
      const createBody = {
        parent: { type: "database_id", database_id: NOTION_DATABASE_ID },
        properties: {
          お客様名: { title: [{ type: "text", text: { content: name || "ゲスト" } }] },
          日時: { date: { start: new Date().toISOString() } },
          会話回数: { number: turnCount || 1 },
          状態: { select: { name: isFinal ? "終了" : "会話中" } },
        },
        children: buildTurnBlocks(turnCount || 1, userMessage, assistantMessage),
      };

      const createRes = await fetch("https://api.notion.com/v1/pages", {
        method: "POST",
        headers: notionHeaders,
        body: JSON.stringify(createBody),
      });
      const createData = await createRes.json();
      if (!createRes.ok) {
        console.error("Notion create page error:", createData);
        return { ok: false, reason: "notion_error", detail: createData };
      }
      return { ok: true, pageId: createData.id };
    }

    const appendRes = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
      method: "PATCH",
      headers: notionHeaders,
      body: JSON.stringify({ children: buildTurnBlocks(turnCount, userMessage, assistantMessage) }),
    });
    const appendData = await appendRes.json();
    if (!appendRes.ok) {
      console.error("Notion append error:", appendData);
      return { ok: false, reason: "notion_error", detail: appendData };
    }

    const updateRes = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      method: "PATCH",
      headers: notionHeaders,
      body: JSON.stringify({
        properties: {
          会話回数: { number: turnCount },
          状態: { select: { name: isFinal ? "終了" : "会話中" } },
        },
      }),
    });
    const updateData = await updateRes.json();
    if (!updateRes.ok) {
      console.error("Notion update error:", updateData);
      return { ok: false, reason: "notion_error", detail: updateData };
    }
    return { ok: true, pageId };
  } catch (err) {
    console.error("writeLegacyLog error:", err);
    return { ok: false, reason: "exception", detail: String(err) };
  }
}

// ============================================================
// ここから下 = 新規追加（Rena管理用データベースへの書き込み）
// ============================================================
async function generateInsights(userMessage, assistantMessage) {
  const fallback = {
    title: userMessage.slice(0, 20) || "ご相談",
    summary: userMessage.slice(0, 60) || "",
    category: "その他",
    needs: "",
    wants: "",
    improvementHint: "",
    contentIdea: "",
  };
  if (!process.env.ANTHROPIC_API_KEY) return fallback;

  const prompt = `以下はサロンのチャットボット「Rena」とお客様の会話です。この内容を読んで、指定した項目をJSON形式のみで出力してください。説明文やコードブロックの記号は一切付けないでください。

【お客様の質問】
${userMessage}

【Renaの回答】
${assistantMessage}

出力するJSONのキーと内容:
- title: 相談内容を20文字以内で表した短い見出し
- summary: 相談内容を1〜2文で説明した少し詳しめの要約
- category: 次の6つの中から最も近いものを1つだけ選ぶ（この文字列と完全に一致させる）: ${CATEGORY_OPTIONS.join(" / ")}
- needs: お客様が抱えている悩みを1文で
- wants: お客様がしてほしいこと・要望を1文で
- improvementHint: サロンの経営改善に活かせるヒントを1〜2文で
- contentIdea: 資料作りや発信に活用できるアイデアを1〜2文で`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": ANTHROPIC_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 600,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await res.json();
    const text = (data?.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim()
      .replace(/^```json/i, "")
      .replace(/```$/, "")
      .trim();
    const parsed = JSON.parse(text);
    const category = CATEGORY_OPTIONS.includes(parsed.category) ? parsed.category : "その他";
    return {
      title: String(parsed.title || fallback.title).slice(0, 60),
      summary: String(parsed.summary || fallback.summary),
      category,
      needs: String(parsed.needs || ""),
      wants: String(parsed.wants || ""),
      improvementHint: String(parsed.improvementHint || ""),
      contentIdea: String(parsed.contentIdea || ""),
    };
  } catch (err) {
    console.error("generateInsights error:", err);
    return fallback;
  }
}

async function writeHqRow({ sessionId, userMessage, assistantMessage, insights }) {
  const apiKey = process.env.NOTION_API_KEY_HQ;
  const databaseId = process.env.NOTION_DATABASE_ID_HQ;
  if (!apiKey || !databaseId) return { ok: false, reason: "not_configured" };

  const salonName = process.env.SALON_NAME || "Moulin-R";

  try {
    const body = {
      parent: { type: "database_id", database_id: databaseId },
      properties: {
        相談タイトル: { title: [{ type: "text", text: { content: insights.title || "ご相談" } }] },
        店舗名: { rich_text: toRichText(salonName) },
        相談日時: { date: { start: new Date().toISOString() } },
        相談カテゴリー: { select: { name: insights.category } },
        "お客様の悩み": { rich_text: toRichText(insights.needs) },
        "お客様の要望": { rich_text: toRichText(insights.wants) },
        相談内容: { rich_text: toRichText(userMessage) },
        AI回答: { rich_text: toRichText(assistantMessage) },
        要約: { rich_text: toRichText(insights.summary) },
        対応状況: { status: { name: "未確認" } },
        経営改善のヒント: { rich_text: toRichText(insights.improvementHint) },
        "資料・発信への活用案": { rich_text: toRichText(insights.contentIdea) },
        セッションID: { rich_text: toRichText(sessionId) },
      },
    };
    const res = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error("Notion HQ create page error:", data);
      return { ok: false, reason: "notion_error", detail: data };
    }
    return { ok: true, pageId: data.id };
  } catch (err) {
    console.error("writeHqRow error:", err);
    return { ok: false, reason: "exception", detail: String(err) };
  }
}

// ============================================================
// エントリーポイント
// ============================================================
module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { name, pageId, userMessage, assistantMessage, turnCount, isFinal } = req.body || {};

  // ① 今まで通りの保存（この結果・レスポンス形式は一切変えない）
  const legacyResult = await writeLegacyLog({ name, pageId, userMessage, assistantMessage, turnCount, isFinal });

  // ② Rena管理用データベースへの追加書き込み。
  // Vercelはレスポンスを返すと処理を打ち切ってしまうため、必ずここで完了を待ってから
  // レスポンスを返す(待たせるのは0.5〜1秒程度で、お客様のチャット表示には影響しない)。
  if (userMessage && assistantMessage) {
    try {
      const sessionId = legacyResult.pageId || pageId || `no-page-${Date.now()}`;
      const insights = await generateInsights(userMessage, assistantMessage);
      await writeHqRow({ sessionId, userMessage, assistantMessage, insights });
    } catch (err) {
      console.error("HQ write pipeline error:", err);
    }
  }

  // ①の結果だけを返す(今までとまったく同じレスポンス形式)
  if (!legacyResult.ok) {
    return res.status(200).json(legacyResult);
  }
  return res.status(200).json({ ok: true, pageId: legacyResult.pageId });
};
