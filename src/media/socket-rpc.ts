/** Small request/reply bridge; room events retain their own onmessage handler. */
export function socketRequest(
  socket: WebSocket,
  path: string,
  body: unknown,
  token?: string,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const cleanup = () => {
      clearTimeout(timer);
      socket.removeEventListener("message", message);
      socket.removeEventListener("close", closed);
      socket.removeEventListener("error", closed);
      socket.removeEventListener("open", send);
    };
    const fail = (reason: string) => {
      cleanup();
      reject(Error(reason));
    };
    const message = (event: MessageEvent) => {
      try {
        const response = JSON.parse(event.data);
        if (response.type !== "rpc-result" || response.id !== id) return;
        cleanup();
        if (response.status >= 400)
          reject(Error(response.body.error || "Room request failed"));
        else resolve(response.body);
      } catch {
        fail("Invalid room response");
      }
    };
    const closed = () => fail("Room connection closed. Rejoin to continue.");
    const send = () =>
      socket.send(JSON.stringify({ type: "rpc", id, path, body, token }));
    const timer = setTimeout(
      () => fail("Room request timed out. Rejoin to continue."),
      15000,
    );
    socket.addEventListener("message", message);
    socket.addEventListener("close", closed);
    socket.addEventListener("error", closed);
    if (socket.readyState === WebSocket.OPEN) send();
    else if (socket.readyState === WebSocket.CONNECTING)
      socket.addEventListener("open", send, { once: true });
    else closed();
  });
}
