/** Stops one persisted TS identity from being used by two live browser sessions on the same target. */
export class IdentityLeaseStore {
  private readonly owners = new Map<string, string>();

  acquire(key: string, owner: string): boolean {
    const currentOwner = this.owners.get(key);
    if (currentOwner && currentOwner !== owner) return false;
    this.owners.set(key, owner);
    return true;
  }

  release(key: string, owner: string): void {
    if (this.owners.get(key) === owner) this.owners.delete(key);
  }
}
