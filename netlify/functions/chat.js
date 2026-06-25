const appendToSheet = async (userMessage, assistantReply, turnNumber, sessionId) => {
  try {
    const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    const spreadsheetId = process.env.SPREADSHEET_ID;

    const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });

    const header = { alg: "RS256", typ: "JWT" };
    const now_s = Math.floor(Date.now() / 1000);
    const claim = {
      iss: serviceAccount.client_email,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      exp: now_s + 3600,
      iat: now_s,
    };

    const b64 = (obj) =>
      Buffer.from(JSON.stringify(obj)).toString("base64url");
    const unsigned = `${b64(header)}.${b64(claim)}`;

    const { createSign } = await import("crypto");
    const sign = createSign("RSA-SHA256");
    sign.update(unsigned);
    const signature = sign.sign(serviceAccount.private_key, "base64url");
    const jwt = `${unsigned}.${signature}`;

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
    });
    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    const sheetRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/log!A:E:append?valueInputOption=USER_ENTERED`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          values: [[now, userMessage, assistantReply, turnNumber, sessionId]],
        }),
      }
    );
    const sheetData = await sheetRes.json();
    console.log("Sheets response:", JSON.stringify(sheetData));

  } catch (e) {
    console.error("Sheets error:", e);
  }
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "APIキーが設定されていません" }),
    };
  }

  try {
    const requestBody = JSON.parse(event.body);
    const messages = requestBody.messages || [];
    const sessionId = requestBody.sessionId || "unknown";
    const turnNumber = Math.ceil(messages.length / 2);
    const userMessage = messages[messages.length - 1]?.content || "";

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: requestBody.max_tokens || 1000,
        system: requestBody.system || "",
        messages: messages,
      }),
    });

    const data = await response.json();

    const assistantReply =
      data.content
        ?.filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("") || "";

    await appendToSheet(userMessage, assistantReply, turnNumber, sessionId);

    return {
      statusCode: response.status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify(data),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ error: "サーバーエラーが発生しました" }),
    };
  }
};
