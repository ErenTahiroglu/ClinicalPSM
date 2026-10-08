// PRODUCTION-SHAPED entrypoint. No diagnostics, no instrumentation, no test hooks, no secrets in source.
import { createHandler, type Env, type Mailer } from './app'

// A real deployment must supply a transactional mail sender (Workers Email Sending needs a paid plan).
// Until then this PoC cannot send mail, so verification/reset cannot complete: fail closed.
const unconfiguredMailer: Mailer = {
  async send() {
    throw new Error('mail sender not configured')
  },
}

const handle = createHandler({ mailer: unconfiguredMailer })
export default { fetch: (req: Request, env: Env) => handle(req, env) }
