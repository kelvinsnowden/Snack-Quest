# Workflows

## `firestore.yml` — rules and indexes

Deploys `firestore.rules` and `firestore.indexes.json` to the
`snack-quest-os` project whenever either changes on `main`.

Before this existed, nothing deployed them. Vercel ships the code and
stops there, so every rules or index change was a manual step somebody
had to remember after the merge — and twice it was not remembered,
which took production down with `FAILED_PRECONDITION` on a query whose
index had never been created.

The rules tests run first and the deploy does not happen if they fail.
That gate is the reason automating this is reasonable rather than
reckless: rules are replaced wholesale, and a bad set locks a business
out of its own data.

### One-time setup

The workflow needs a credential that can deploy Firestore rules. It is
the only part nobody can do from inside the repo.

1. Open the [Google Cloud service accounts page][sa] for
   `snack-quest-os`.
2. **Create service account** — call it something like
   `github-firestore-deploy`.
3. Grant it **Cloud Datastore Owner** (`roles/datastore.owner`) and
   **Firebase Rules Admin** (`roles/firebaserules.admin`).
   Those two cover rules and indexes and nothing else — deliberately
   not Editor or Owner, which would let a leaked key do far more than
   this job needs.
4. On that account: **Keys → Add key → Create new key → JSON**. A file
   downloads.
5. In GitHub: **Settings → Secrets and variables → Actions → New
   repository secret**.
   - Name: `FIREBASE_SERVICE_ACCOUNT`
   - Value: the entire contents of that JSON file, pasted as-is.
6. Delete the downloaded file. GitHub has it now, and a private key
   sitting in a Downloads folder is the usual way one escapes.

[sa]: https://console.cloud.google.com/iam-admin/serviceaccounts?project=snack-quest-os

### After it runs

**Rules are live immediately. Indexes are not.** A green run means
Firebase accepted the index definitions, not that it has finished
building them — a large one takes minutes, and any query that needs it
fails until it is `READY`.

Check the [indexes page][idx] after a run that changed
`firestore.indexes.json`.

[idx]: https://console.firebase.google.com/project/snack-quest-os/firestore/indexes

### Running it by hand

**Actions → Firestore rules and indexes → Run workflow.** Useful when
an index failed to build and needs retrying, without having to invent
a commit.
