export function prioritizeSharedStory(items, storyId) {
  if (!storyId) return items;

  const index = items.findIndex((item) => item.id === storyId);
  if (index <= 0) return items;

  return [items[index], ...items.slice(0, index), ...items.slice(index + 1)];
}
