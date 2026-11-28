// The fake GitHub endpoint as a service of compose.test.yaml: on 0.0.0.0 of its container, port 8080.
import { startFake } from './server.mts'

const fake = await startFake(8080, '0.0.0.0')
console.log(`fake GitHub on ${fake.url}`)
