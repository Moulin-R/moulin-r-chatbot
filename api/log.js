// api/log.js
// お客様とRenaの会話をNotionデータベースに自動保存するAPI
//
// 【必要な環境変数】(Vercelの Settings > Environment Variables で設定)
//   NOTION_API_KEY      … Notionインテグレーションのシークレット
//   NOTION_DATA_SOURCE_ID … 会話ログ用データベースのデータソースID

const NOTION_VERSION = "2022-06-28";

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

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const NOTION_API_KEY = process.env.NOTION_API_KEY;
  const NOTION_DATA_SOURCE_ID = process.env.NOTION_DATA_SOURCE_ID;

  if (!NOTION_API_KEY || !NOTION_DATA_SOURCE_ID) {
    console.error("Notion env vars are missing");
    return res.status(200).json({ ok: false, reason: "not_configured" });
  }

  try {
    const {
      name,
      pageId,
      userMessage,
      assistantMessage,
      turnCount,
      isFinal,
    } = req.body || {};

    const notionHeaders = {
      Authorization: `Bearer ${NOTION_API_KEY}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    };

    if (!pageId) {
      const createBody = {
        parent: { type: "data_source_id", data_source_id: NOTION_DATA_SOURCE_ID },
        properties: {
          お客様名: {
            title: [{ type: "text", text: { content: name || "ゲスト" } }],
          },
          日時: {
            date: { start: new Date().toISOString() },
          },
          会話回数: {
            number: turnCount || 1,
          },
          状態: {
            select: { name: isFinal ? "終了" : "会話中" },
          },
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
        return res.status(200).json({ ok: false, reason: "notion_error", detail: createData });
      }

      return res.status(200).json({ ok: true, pageId: createData.id });
    }

    const appendRes = await fetch(
      `https://api.notion.com/v1/blocks/${pageId}/children`,
      {
        method: "PATCH",
        headers: notionHeaders,
        body: JSON.stringify({
          children: buildTurnBlocks(turnCount, userMessage, assistantMessage),
        }),
      }
    );
    const appendData = await appendRes.json();

    if (!appendRes.ok) {
      console.error("Notion append error:", appendData);
      return res.status(200).json({ ok: false, reason: "notion_error", detail: appendData });
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
      return res.status(200).json({ ok: false, reason: "notion_error", detail: updateData });
    }

    return res.status(200).json({ ok: true, pageId });
  } catch (err) {
    console.error("log.js error:", err);
    return res.status(200).json({ ok: false, reason: "exception", detail: String(err) });
  }
};
