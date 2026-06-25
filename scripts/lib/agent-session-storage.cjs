/**
 * Agent session persistence on disk (Electron userData).
 */
const fs = require("fs");
const path = require("path");

function sessionDirForUserData(userDataPath) {
  return path.join(String(userDataPath || ""), "agent-memory");
}

function sessionFileForUserData(userDataPath) {
  return path.join(sessionDirForUserData(userDataPath), "video-prep-agent-session.json");
}

function loadAgentSessionFile(userDataPath) {
  const fp = sessionFileForUserData(userDataPath);
  if (!fs.existsSync(fp)) {
    return { ok: true, session: null, path: fp };
  }
  const raw = fs.readFileSync(fp, "utf8");
  const session = JSON.parse(raw);
  return { ok: true, session, path: fp };
}

function saveAgentSessionFile(userDataPath, session) {
  const dir = sessionDirForUserData(userDataPath);
  fs.mkdirSync(dir, { recursive: true });
  const fp = sessionFileForUserData(userDataPath);
  fs.writeFileSync(fp, JSON.stringify(session ?? {}, null, 2), "utf8");
  return { ok: true, path: fp };
}

module.exports = {
  loadAgentSessionFile,
  saveAgentSessionFile,
  sessionDirForUserData,
  sessionFileForUserData,
};
