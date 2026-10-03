import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"

const runDir = path.resolve("ops", "run")
const libDir = path.join(runDir, "lib")
const wrapperPath = path.join(runDir, "bin", "pnpm.cmd")
const taskRunnerPath = path.join(runDir, "run-task.bat")
const rootLaunchers = ["run.bat", "test.bat", "deploy.bat", "tools.bat"].map((fileName) => path.resolve(fileName))

function listBatchScripts(directory = runDir) {
  return fs.readdirSync(directory)
    .filter((fileName) => fileName.endsWith(".bat"))
    .map((fileName) => path.join(directory, fileName))
}

function read(scriptPath: string) {
  return fs.readFileSync(scriptPath, "utf8")
}

function usesPinnedRunner(scriptPath: string, visited = new Set<string>()): boolean {
  if (visited.has(scriptPath)) return false
  visited.add(scriptPath)
  const script = read(scriptPath)
  if (/ops\\run\\bin\\pnpm\.cmd/i.test(script)) return true
  const delegates = [...script.matchAll(/call\s+"%~dp0([\w-]+\.bat)"/gi)]
  return delegates.length > 0 && delegates.every((match) => {
    const target = path.join(runDir, match[1])
    return fs.existsSync(target) && usesPinnedRunner(target, new Set(visited))
  })
}

test("Windows run scripts use the pinned pnpm wrapper", () => {
  assert.equal(fs.existsSync(wrapperPath), true)

  for (const scriptPath of listBatchScripts()) {
    const script = read(scriptPath)
    assert.doesNotMatch(script, /\bcorepack\s+pnpm\b/i, scriptPath)
    assert.doesNotMatch(script, /\bnpx\s+/i, scriptPath)
    assert.doesNotMatch(script, /^\s*(call\s+)?pnpm(\.cmd)?\s/im, scriptPath)
    assert.equal(usesPinnedRunner(scriptPath), true, scriptPath)
  }
})

test("root launchers hand over to ops/run and keep a double-clicked window open", () => {
  for (const launcherPath of rootLaunchers) {
    const script = read(launcherPath)
    const target = script.match(/call "%~dp0ops\\run\\([\w-]+\.bat)" %\*/i)
    assert.ok(target, `${launcherPath} calls an ops\\run script with every argument`)
    assert.equal(fs.existsSync(path.join(runDir, target[1])), true, target[1])
    assert.match(script, /call "%~dp0ops\\run\\lib\\finish\.bat" %errorlevel% "%~f0"\s*$/i, launcherPath)
  }
})

test("every launcher in ops/run ends with the shared finish step", () => {
  for (const scriptPath of listBatchScripts()) {
    if (scriptPath === taskRunnerPath) continue
    assert.match(read(scriptPath), /call "%~dp0lib\\finish\.bat" %(errorlevel|code)% "%~f0"\s*$/i, scriptPath)
  }
})

test("launcher references point at scripts that exist", () => {
  for (const scriptPath of [...rootLaunchers, ...listBatchScripts(), ...listBatchScripts(libDir)]) {
    for (const match of read(scriptPath).matchAll(/"%~dp0([\w\\-]+\.(?:bat|cmd))"/gi)) {
      const target = path.join(path.dirname(scriptPath), ...match[1].split("\\"))
      assert.equal(fs.existsSync(target), true, `${scriptPath} -> ${match[1]}`)
    }
  }
})

test("every task a launcher asks for exists in the task runner", () => {
  const runner = read(taskRunnerPath)
  const accepted = runner.match(/for %%t in \(([^)]*)\)/i)?.[1].split(/\s+/).filter(Boolean) ?? []
  assert.ok(accepted.length > 0)
  for (const task of accepted) {
    assert.match(runner, new RegExp(`^:run_${task}\\r?$`, "im"), task)
  }
  const requested = listBatchScripts().flatMap((scriptPath) =>
    [...read(scriptPath).matchAll(/run-task\.bat" (\w+)/gi)].map((match) => match[1]))
  assert.ok(requested.length > 0)
  for (const task of requested) {
    assert.ok(accepted.includes(task), task)
  }
})

test("Windows launchers keep CRLF line endings", () => {
  const scripts = [...rootLaunchers, ...listBatchScripts(), ...listBatchScripts(libDir), wrapperPath]
  for (const scriptPath of scripts) {
    assert.doesNotMatch(read(scriptPath), /(^|[^\r])\n/, `${scriptPath} has a bare LF line ending`)
  }
  assert.match(read(path.resolve(".gitattributes")), /^\*\.bat\s+text\s+eol=crlf$/m)
})
