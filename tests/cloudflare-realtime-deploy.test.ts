import assert from "node:assert/strict"
import test from "node:test"
import { isCloudflareRealtimeEntitlementError } from "../ops/scripts/deploy-realtime-optional"

test("realtime deploy policy detects Cloudflare entitlement failures", () => {
  assert.equal(
    isCloudflareRealtimeEntitlementError(
      "A request to the Cloudflare API failed. entitlements.not_available [code: 10007]",
    ),
    true,
  )
})

test("realtime deploy policy does not hide unrelated deploy failures", () => {
  assert.equal(
    isCloudflareRealtimeEntitlementError("workers.api.error [code: 10001] invalid durable object binding"),
    false,
  )
})
