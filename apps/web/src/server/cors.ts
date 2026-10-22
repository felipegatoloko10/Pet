export function cors(request: Request, response: Response) {
  const origin = request.headers.get("origin");
  const allowed = [
    process.env.BETTER_AUTH_URL,
    "tauri://localhost",
    "http://tauri.localhost",
    "https://tauri.localhost",
  ];
  if (origin && allowed.includes(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Vary", "Origin");
    response.headers.set(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization",
    );
    response.headers.set(
      "Access-Control-Allow-Methods",
      "GET, POST, DELETE, OPTIONS",
    );
    if (origin === process.env.BETTER_AUTH_URL)
      response.headers.set("Access-Control-Allow-Credentials", "true");
  }
  return response;
}
