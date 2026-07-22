import React from "react";
import { motion } from "motion/react";

interface TimelineContentProps {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "p" | "article" | "section" | "span" | any;
  customVariants?: any;
  animationNum?: number;
  timelineRef?: React.RefObject<HTMLElement | null>;
  [key: string]: any;
}

const motionComponents = {
  div: motion.div,
  p: motion.p,
  article: motion.article,
  section: motion.section,
  span: motion.span,
} as const;

export const TimelineContent: React.FC<TimelineContentProps> = ({
  children,
  className,
  as = "div",
  customVariants,
  animationNum = 0,
  timelineRef,
  ...props
}) => {
  // Obtener componente de movimiento estático predefinido
  const MotionComponent = (motionComponents as any)[as] || motion.div;

  // Variantes por defecto si no se especifican personalizadas
  const defaultVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.5,
        delay: animationNum * 0.15,
        ease: "easeOut",
      },
    },
  };

  const variants = customVariants || defaultVariants;

  return (
    <MotionComponent
      className={className}
      initial="hidden"
      animate="visible"
      variants={variants}
      custom={animationNum}
      {...props}
    >
      {children}
    </MotionComponent>
  );
};
