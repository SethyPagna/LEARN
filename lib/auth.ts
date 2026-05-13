import nodeCrypto from "node:crypto"

const PASSWORD_ALGORITHM = "pbkdf2_sha512"
const PASSWORD_ITERATIONS = 210_000
const PASSWORD_KEY_LENGTH = 64
const SESSION_TOKEN_BYTES = 32

function timingSafeEqualText(first: string, second: string) {
  const firstBuffer = Buffer.from(first)
  const secondBuffer = Buffer.from(second)
  if (firstBuffer.length !== secondBuffer.length) return false
  return nodeCrypto.timingSafeEqual(firstBuffer, secondBuffer)
}

function toBase64Url(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64url")
}

function randomBytes(length: number) {
  const webCrypto = globalThis.crypto
  if (webCrypto?.getRandomValues) {
    const bytes = new Uint8Array(length)
    webCrypto.getRandomValues(bytes)
    return bytes
  }
  return nodeCrypto.randomBytes(length)
}

async function derivePassword(password: string, salt: string, iterations: number) {
  const subtle = globalThis.crypto?.subtle
  if (subtle) {
    const encoder = new TextEncoder()
    const key = await subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"])
    const bits = await subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-512", salt: encoder.encode(salt), iterations },
      key,
      PASSWORD_KEY_LENGTH * 8,
    )
    return toBase64Url(new Uint8Array(bits))
  }

  return new Promise<string>((resolve, reject) => {
    nodeCrypto.pbkdf2(
      password,
      salt,
      iterations,
      PASSWORD_KEY_LENGTH,
      "sha512",
      (error, derivedKey) => {
        if (error) reject(error)
        else resolve(derivedKey.toString("base64url"))
      },
    )
  })
}

export function createSessionToken() {
  return toBase64Url(randomBytes(SESSION_TOKEN_BYTES))
}

export function hashSessionToken(token: string) {
  return nodeCrypto.createHash("sha256").update(token, "utf8").digest("hex")
}

export async function hashPassword(password: string) {
  const salt = toBase64Url(randomBytes(16))
  const hash = await derivePassword(password, salt, PASSWORD_ITERATIONS)

  return [PASSWORD_ALGORITHM, PASSWORD_ITERATIONS, salt, hash].join("$")
}

export async function verifyPassword(password: string, storedHash: string) {
  const [algorithm, iterationsText, salt, expectedHash] = storedHash.split("$")
  const iterations = Number(iterationsText)
  if (algorithm !== PASSWORD_ALGORITHM || !iterations || !salt || !expectedHash) {
    return false
  }

  const actualHash = await derivePassword(password, salt, iterations)

  return timingSafeEqualText(actualHash, expectedHash)
}
