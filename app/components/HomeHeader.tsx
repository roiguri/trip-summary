import { Brand } from './Brand';
import { SignOutButton } from './SignOutButton';

/** The bar above the home page: the mark, and for the signed-in account its actions. */
export function HomeHeader({ name, canCreate }: { name: string; canCreate: boolean }) {
  return (
    <header className="header home-header">
      <Brand />
      <div className="home-actions">
        {canCreate && (
          <a className="pill-button primary" href="/trips/new">
            + New trip
          </a>
        )}
        <span className="home-account">{name}</span>
        <SignOutButton />
      </div>
    </header>
  );
}
