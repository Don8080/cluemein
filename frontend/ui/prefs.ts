// "Last Ruleset" cookie: the Start screen defaults to the game used last.
const NAME = 'last_ruleset';

export function getLastRuleset(): number | null {
  const m = document.cookie.match(new RegExp('(?:^|; )' + NAME + '=(\\d+)'));
  return m ? Number(m[1]) : null;
}

export function setLastRuleset(id: number) {
  document.cookie = `${NAME}=${id}; path=/; max-age=${365 * 24 * 3600}; samesite=lax`;
}
