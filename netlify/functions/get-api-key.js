export const handler = async (event, context) => {
  // Only allow POST
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { idToken } = JSON.parse(event.body);
    if (!idToken) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing ID Token" }) };
    }

    // Verify token with Google's API
    const verifyUrl = `https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`;
    const response = await fetch(verifyUrl);
    const ticket = await response.json();

    if (!response.ok || ticket.error) {
      return { statusCode: 401, body: JSON.stringify({ error: "Invalid Token" }) };
    }

    // Check domain
    if (ticket.hd !== "mi-rai.co.jp") {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: "Access restricted to mi-rai.co.jp accounts." })
      };
    }

    // Return the API Key from environment variables
    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      console.error("Missing GEMINI_API_KEY in environment");
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "API Key not configured on server." })
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey }),
    };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
