import * as React from "react";
import { cn } from "@/lib/utils";

export type AvatarProps = React.HTMLAttributes<HTMLDivElement>;
export type AvatarImageProps = React.ImgHTMLAttributes<HTMLImageElement>;
export type AvatarFallbackProps = React.HTMLAttributes<HTMLSpanElement>;

export function Avatar({ className, ...props }: AvatarProps) {
  return (
    <div
      className={cn("relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full", className)}
      {...props}
    />
  );
}

export function AvatarImage({ className, ...props }: AvatarImageProps) {
  return (
    <img
      className={cn("aspect-square h-full w-full", className)}
      {...props}
    />
  );
}

export function AvatarFallback({ className, ...props }: AvatarFallbackProps) {
  return (
    <span
      className={cn(
        "flex h-full w-full items-center justify-center rounded-full bg-muted",
        className
      )}
      {...props}
    />
  );
}
