/** An element of the engine pages by id: the ids the page has always had. */
export const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
