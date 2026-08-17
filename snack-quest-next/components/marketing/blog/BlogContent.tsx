import type { BlogBlock } from '@/lib/blog/posts';

export function BlogContent({ blocks }: { blocks: BlogBlock[] }) {
  return (
    <div className="mt-10 flex flex-col gap-5">
      {blocks.map((block, index) => {
        if (block.type === 'h2') {
          return (
            <h2 key={index} className="text-card-title mt-4 font-semibold text-foreground">
              {block.text}
            </h2>
          );
        }
        if (block.type === 'list') {
          return (
            <ul key={index} className="flex flex-col gap-2 pl-1">
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex} className="text-body flex gap-3 text-muted-foreground">
                  <span aria-hidden="true" className="mt-2.5 size-1.5 shrink-0 rounded-full bg-primary" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={index} className="text-body text-muted-foreground">
            {block.text}
          </p>
        );
      })}
    </div>
  );
}
