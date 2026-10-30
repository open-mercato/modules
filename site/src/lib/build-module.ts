// The command that starts a new module (live review of 30 Oct, item 4): create-mercato-module 0.5.1 needs a name after
// `init` and checks it is snake_case, and with no arguments it only prints its help. Isomorphic: islands import it.

/** A placeholder name that passes the tool's check, so the copied command runs as it is. */
export const BUILD_MODULE_NAME = 'my_module'

/** Scaffolds src/modules/my_module in the app and registers it. */
export const BUILD_MODULE_COMMAND = `npx create-mercato-module init ${BUILD_MODULE_NAME}`

/** The line under the command. */
export const BUILD_MODULE_HINT = `Replace ${BUILD_MODULE_NAME} with your module name in snake_case.`
