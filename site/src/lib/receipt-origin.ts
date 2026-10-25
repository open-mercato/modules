// Where the receipts of a build come from, in the words of /quality (finding of 25 Oct): a preview build names the
// preview run, never the nightly run or the GitHub Actions API (review r6/r7, as /about and the footer do). Isomorphic.

export interface ReceiptOrigin {
  /** The end of the SIG-RCP rule: where a step's status is read. */
  status: string
  /** Who installs the module for the Verified level. */
  run: string
}

export function receiptOrigin(preview: boolean): ReceiptOrigin {
  return preview
    ? {
        status:
          'Status comes from the exit codes the preview runner records outside the cell, not from files the module could write.',
        run: 'the preview run',
      }
    : {
        status: 'Status comes from the GitHub Actions API, not from files the module could write.',
        run: 'the nightly run',
      }
}
