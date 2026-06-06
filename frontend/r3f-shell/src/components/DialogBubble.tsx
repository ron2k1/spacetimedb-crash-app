import { Html } from '@react-three/drei';
import { motion, AnimatePresence } from 'motion/react';
import { useDialogStore } from '../store/dialogStore';
import { theme, FONT, SHADOW } from '../theme';

// DialogBubble is now purely the fox's VOICE -- a read-only speech bubble that floats above the
// mascot and tracks it as the camera orbits (anchored in 3D via drei <Html>). It shows whatever
// Crash is "saying": a greeting when you tap the fox, or a status line when you send a request from
// the PromptBar. Typing moved OUT of here into the screen-fixed PromptBar, so this never takes input.
// Click the bubble to dismiss it. It springs in/out via AnimatePresence so speech feels alive.
export function DialogBubble() {
  const open = useDialogStore((s) => s.open);
  const prompt = useDialogStore((s) => s.prompt);
  const reset = useDialogStore((s) => s.reset);
  const show = open && prompt.trim().length > 0;

  return (
    // No distanceFactor: the bubble stays a constant, readable screen size while still being pinned
    // above the fox in 3D, so text never shrinks to nothing as you zoom out.
    <Html position={[0, 2.0, 0]} center zIndexRange={[60, 0]}>
      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ opacity: 0, scale: 0.7, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.7, y: 8 }}
            transition={{ type: 'spring', stiffness: 460, damping: 26 }}
            onClick={reset}
            style={{
              position: 'relative',
              maxWidth: 230,
              padding: '12px 16px',
              borderRadius: 18,
              background: theme.ui.panelSolid,
              border: `1.5px solid ${theme.ui.line}`,
              boxShadow: SHADOW.cardHover,
              color: theme.ui.ink,
              fontFamily: FONT.display,
              fontWeight: 800,
              fontSize: 15,
              lineHeight: 1.3,
              textAlign: 'center',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            {prompt}
            {/* A little diamond tail pointing down toward the fox, faked with two borders on a
                rotated square so it reads as one continuous bubble outline. */}
            <span
              style={{
                position: 'absolute',
                left: '50%',
                bottom: -8,
                transform: 'translateX(-50%) rotate(45deg)',
                width: 16,
                height: 16,
                background: theme.ui.panelSolid,
                borderRight: `1.5px solid ${theme.ui.line}`,
                borderBottom: `1.5px solid ${theme.ui.line}`,
                borderBottomRightRadius: 4,
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </Html>
  );
}
