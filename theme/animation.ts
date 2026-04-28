export const animation = {
  duration: {
    instant: 100,
    fast: 200,
    normal: 300,
    slow: 500,
  },
  easing: {
    fluid: { damping: 15, stiffness: 150 },
    standard: { damping: 20, stiffness: 200 },
    snappy: { damping: 12, stiffness: 250 },
  },
  stagger: 50,
} as const;
