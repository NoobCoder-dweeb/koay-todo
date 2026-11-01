# Family Todo App — Product Scope

## Product goal

A fast, simple iOS and Android app where up to five family members can share and sync a todo list.

## Product features (MVP)

- **Family space:** Create one shared family space and invite members with a link or code. Limit the MVP to five members per family.
- **Sign-in:** Members sign in with a supported provider such as Apple or Google.
- **Shared todo list:** View one list shared by the family.
- **Todo actions:** Add, edit, complete or undo, and delete todo items.
- **Optional assignment:** Assign an item to a family member; leaving it unassigned is allowed.
- **Realtime sync:** Show changes from other members without requiring a manual refresh.
- **Offline use:** Keep the list available locally and queue edits while offline; sync them when the device reconnects.
- **Basic conflict handling:** If the same item is edited on multiple devices, the latest saved update wins.

## Out of scope for the MVP

- Multiple lists, list categories, or list-specific permissions
- Due dates, reminders, recurring todos, or calendar integration
- Subtasks, comments, attachments, photos, or file uploads
- Push notifications
- Advanced roles, moderation, or audit history
- Search, labels, filters, sorting options, or custom themes
- Web or desktop applications
- Import/export, integrations, or public sharing
- Guaranteed availability on a free hosting tier

## Non-functional requirements

### Performance and responsiveness

- The main list should appear promptly on launch, using locally stored data when available.
- Adding, editing, and completing a todo should update the interface immediately without waiting for the server.
- Sync should run in the background and avoid blocking normal list use.

### Reliability and synchronization

- Support intermittent or unavailable network connections without losing locally queued edits.
- Reconcile pending edits after reconnection and converge on the same list across members' devices.
- Clearly indicate when the app is offline or changes are still syncing.

### Security and privacy

- Require authentication to access a family space.
- Enforce family membership in Firebase security rules so members can read and modify only their own family's data.
- Do not embed Firebase Admin credentials or other server secrets in the mobile app.
- Transmit data over HTTPS and store only the information needed for the todo-list experience.

### Platform compatibility

- Support current, actively maintained iOS and Android versions selected at implementation time.
- Keep core interactions and behavior consistent across both platforms.

### Scale and cost

- Initial target: one family space with no more than five members.
- Use Firebase Authentication and Cloud Firestore; stay within the applicable free-tier quotas where possible.
- Monitor database reads, writes, storage, and data transfer; free-tier quotas and availability are not guaranteed and may change.

### Usability and accessibility

- Open directly to the shared list after sign-in.
- Make adding and completing an item easy to do with one hand.
- Use readable text, accessible labels, and sufficient contrast.
- Provide clear feedback for errors, offline state, and sync status.
