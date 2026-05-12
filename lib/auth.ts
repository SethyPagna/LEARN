import crypto from "node:crypto"

const PASSWORD_ALGORITHM = "pbkdf2_sha512"
const PASSWORD_ITERATIONS = 210_000
const PASSWORD_KEY_LENGTH = 64
const SESSION_TOKEN_BYTES = 32

function timingSafeEqualText(first: string, second: string) {
  const firstBuffer = Buffer.from(first)
  const secondBuffer = Buffer.from(second)
  if (firstBuffer.length !== secondBuffer.length) return false
  return crypto.timingSafeEqual(firstBuffer, secondBuffer)
}

export function createSessionToken() {
  return crypto.randomBytes(SESSION_TOKEN_BYTES).toString("base64url")
}

export function hashSessionToken(token: string) {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex")
}

export async function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("base64url")
  const hash = await new Promise<string>((resolve, reject) => {
    crypto.pbkdf2(
      password,
      salt,
      PASSWORD_ITERATIONS,
      PASSWORD_KEY_LENGTH,
      "sha512",
      (error, derivedKey) => {
        if (error) reject(error)
        else resolve(derivedKey.toString("base64url"))
      },
    )
  })

  return [PASSWORD_ALGORITHM, PASSWORD_ITERATIONS, salt, hash].join("$")
}

export async function verifyPassword(password: string, storedHash: string) {
  const [algorithm, iterationsText, salt, expectedHash] = storedHash.split("$")
  const iterations = Number(iterationsText)
  if (algorithm !== PASSWORD_ALGORITHM || !iterations || !salt || !expectedHash) {
    return false
  }

  const actualHash = await new Promise<string>((resolve, reject) => {
    crypto.pbkdf2(password, salt, iterations, PASSWORD_KEY_LENGTH, "sha512", (error, derivedKey) => {
      if (error) reject(error)
      else resolve(derivedKey.toString("base64url"))
    })
  })

  return timingSafeEqualText(actualHash, expectedHash)
}
