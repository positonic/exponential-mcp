import type { Domain } from './framework.js';
import { actions } from './actions.js';
import { areas } from './areas.js';
import { comments } from './comments.js';
import { contacts } from './contacts.js';
import { deals } from './deals.js';
import { decisions } from './decisions.js';
import { epics } from './epics.js';
import { features } from './features.js';
import { goals } from './goals.js';
import { keyResults } from './keyResults.js';
import { labels } from './labels.js';
import { meetings } from './meetings.js';
import { organizations } from './organizations.js';
import { pages } from './pages.js';
import { products } from './products.js';
import { projects } from './projects.js';
import { requirements } from './requirements.js';
import { scopes } from './scopes.js';
import { stories } from './stories.js';
import { tickets } from './tickets.js';
import { time } from './time.js';
import { workspaces } from './workspaces.js';

export { runDomainTool, toolDefinition } from './framework.js';
export type { Domain } from './framework.js';

/** Every domain tool, keyed by tool name. */
export const DOMAINS: ReadonlyMap<string, Domain> = new Map(
  [
    actions,
    projects,
    workspaces,
    goals,
    keyResults,
    meetings,
    time,
    decisions,
    contacts,
    organizations,
    deals,
    products,
    features,
    scopes,
    requirements,
    areas,
    stories,
    epics,
    tickets,
    labels,
    pages,
    comments,
  ].map((domain) => [domain.name, domain])
);
