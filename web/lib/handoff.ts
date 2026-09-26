import type { Match, Post } from './api';

// What a card already knows about its match or clip, handed to the page it opens. The page can
// then draw that thing on its first frame, which lets the view transition morph the card into it.
const posts = new Map<string, Post>();
const matches = new Map<string, Match>();

export const handOffPost = (post: Post) => { posts.set(post.id, post); };
export const takePost = (id: string | null) => (id ? posts.get(id) ?? null : null);
export const handOffMatch = (match: Match) => { matches.set(match.id, match); };
export const takeMatch = (id: string) => matches.get(id) ?? null;
