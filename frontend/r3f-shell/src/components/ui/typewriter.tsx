import { useEffect, useState } from "react";
import { motion, type Variants } from "motion/react";

import { cn } from "@/lib/utils";

// Typewriter -- types text out character-by-character with a blinking cursor. We use it to animate
// the way Crash's headless local LLM "speaks": its answer is revealed as if typed live. The model
// still runs entirely on the user's machine; this only governs PRESENTATION of the already-received
// text. Single-pass (loop={false}) for an answer; cycling (loop) for ambient mascot lines.
//
// NOTE: import is "motion/react" (the modern Framer Motion package this repo standardizes on), NOT
// "framer-motion" -- importing both would load two copies of the lib, split React context, and crash
// (same class of bug the R3F dedupe fix solved). Timer type is ReturnType<typeof setTimeout> so it
// resolves to the DOM number id in the browser instead of the Node-only NodeJS.Timeout.

interface TypewriterProps {
  text: string | string[];
  speed?: number;
  initialDelay?: number;
  waitTime?: number;
  deleteSpeed?: number;
  loop?: boolean;
  className?: string;
  showCursor?: boolean;
  hideCursorOnType?: boolean;
  cursorChar?: string | React.ReactNode;
  cursorClassName?: string;
  cursorAnimationVariants?: {
    initial: Variants["initial"];
    animate: Variants["animate"];
  };
}

const Typewriter = ({
  text,
  speed = 50,
  initialDelay = 0,
  waitTime = 2000,
  deleteSpeed = 30,
  loop = true,
  className,
  showCursor = true,
  hideCursorOnType = false,
  cursorChar = "|",
  cursorClassName = "ml-1",
  cursorAnimationVariants = {
    initial: { opacity: 0 },
    animate: {
      opacity: 1,
      transition: {
        duration: 0.01,
        repeat: Infinity,
        repeatDelay: 0.4,
        repeatType: "reverse",
      },
    },
  },
}: TypewriterProps) => {
  const [displayText, setDisplayText] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [currentTextIndex, setCurrentTextIndex] = useState(0);

  const texts = Array.isArray(text) ? text : [text];

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;

    const currentText = texts[currentTextIndex];

    const startTyping = () => {
      if (isDeleting) {
        if (displayText === "") {
          setIsDeleting(false);
          if (currentTextIndex === texts.length - 1 && !loop) {
            return;
          }
          setCurrentTextIndex((prev) => (prev + 1) % texts.length);
          setCurrentIndex(0);
          timeout = setTimeout(() => {}, waitTime);
        } else {
          timeout = setTimeout(() => {
            setDisplayText((prev) => prev.slice(0, -1));
          }, deleteSpeed);
        }
      } else {
        if (currentIndex < currentText.length) {
          timeout = setTimeout(() => {
            setDisplayText((prev) => prev + currentText[currentIndex]);
            setCurrentIndex((prev) => prev + 1);
          }, speed);
        } else if (texts.length > 1) {
          timeout = setTimeout(() => {
            setIsDeleting(true);
          }, waitTime);
        }
      }
    };

    // Honor initialDelay only on the very first character of the very first string.
    if (currentIndex === 0 && !isDeleting && displayText === "") {
      timeout = setTimeout(startTyping, initialDelay);
    } else {
      startTyping();
    }

    return () => clearTimeout(timeout);
  }, [
    currentIndex,
    displayText,
    isDeleting,
    speed,
    deleteSpeed,
    waitTime,
    texts,
    currentTextIndex,
    loop,
    initialDelay,
  ]);

  return (
    <div className={cn("inline whitespace-pre-wrap tracking-tight", className)}>
      <span>{displayText}</span>
      {showCursor && (
        <motion.span
          variants={cursorAnimationVariants}
          className={cn(
            "inline-block",
            cursorClassName,
            hideCursorOnType &&
              (currentIndex < texts[currentTextIndex].length || isDeleting)
              ? "hidden"
              : "",
          )}
          initial="initial"
          animate="animate"
        >
          {cursorChar}
        </motion.span>
      )}
    </div>
  );
};

export { Typewriter };
