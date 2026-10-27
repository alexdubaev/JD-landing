import net, { type Server, type Socket } from "node:net";

/** Isolated loopback SMTP sink that records the actual MIME DATA received by Nodemailer. */
export async function startSmtpFixture() {
  const messages: string[] = [];
  const sockets = new Set<Socket>();
  const server: Server = net.createServer((socket) => {
    sockets.add(socket);
    socket.write("220 localhost ESMTP fixture\r\n");
    let buffer = "";
    let data = false;
    let current = "";
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      while (buffer.includes("\r\n")) {
        const index = buffer.indexOf("\r\n");
        const line = buffer.slice(0, index); buffer = buffer.slice(index + 2);
        if (data) {
          if (line === ".") { messages.push(current); current = ""; data = false; socket.write("250 queued\r\n"); }
          else current += `${line.startsWith("..") ? line.slice(1) : line}\r\n`;
        } else if (/^EHLO|^HELO/iu.test(line)) socket.write("250-localhost\r\n250 AUTH PLAIN LOGIN\r\n");
        else if (/^AUTH/iu.test(line)) socket.write("235 authenticated\r\n");
        else if (/^MAIL FROM|^RCPT TO/iu.test(line)) socket.write("250 ok\r\n");
        else if (line === "DATA") { data = true; socket.write("354 end with dot\r\n"); }
        else if (line === "QUIT") socket.write("221 bye\r\n");
        else socket.write("250 ok\r\n");
      }
    });
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("SMTP fixture failed to bind");
  return { port: address.port, messages, async close() { for (const socket of sockets) socket.destroy(); await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); } };
}
