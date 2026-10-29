/** Original, locally rendered vector accessories. No external assets or network. */
export function ItemArt({ id }: { id: string }) {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 100 80"
      aria-hidden="true"
      className="pet-item-art"
    >
      <g
        stroke="#25232B"
        strokeWidth="3"
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        {id === "bow" && (
          <>
            <path
              d="M47 39 Q10 8 16 48 Q20 70 47 44 M53 39 Q90 8 84 48 Q80 70 53 44"
              fill="#FFC8DD"
            />
            <circle cx="50" cy="41" r="9" fill="#C9B6FF" />
          </>
        )}
        {id === "scarf" && (
          <>
            <path
              d="M14 24 Q50 42 86 24 L67 66 L48 54 L31 66 Z"
              fill="#B8E0FF"
            />
            <path d="M22 33 Q50 49 78 33" fill="none" />
            <path d="m48 49 5 5-5 5-5-5z" fill="#FFF3A8" />
          </>
        )}
        {id === "cloud" && (
          <>
            <path
              d="M15 46 Q0 29 22 24 Q25 4 44 17 Q63 0 73 22 Q98 16 87 45 Z"
              fill="#FFFEFA"
            />
            <path d="M13 47 Q50 57 89 46 L86 58 Q50 67 16 58Z" fill="#B8E0FF" />
          </>
        )}
        {id === "crown" && (
          <>
            <path
              d="M14 25 34 39 50 16 66 39 86 25 78 62 H22Z"
              fill="#FFF3A8"
            />
            <path
              d="m50 35 4 8 9 1-7 6 2 9-8-5-8 5 2-9-7-6 9-1z"
              fill="#FFC8DD"
            />
          </>
        )}
        {id === "cushion" && (
          <>
            <path
              d="M15 23 Q50 10 85 23 Q75 40 85 58 Q50 70 15 58 Q25 40 15 23Z"
              fill="#C9B6FF"
            />
            <path
              d="M50 36 C36 21 29 43 50 54 C71 43 64 21 50 36"
              fill="#FFC8DD"
            />
          </>
        )}
        {id === "plant" && (
          <>
            <path
              d="M50 45V17 M50 33 Q20 32 28 11 Q48 10 50 33 M51 28 Q77 24 74 7 Q54 5 51 28"
              fill="#A8F0E0"
            />
            <path d="M29 40H71L64 70H36Z" fill="#FFC8DD" />
            <path d="M44 56 Q50 62 56 56" fill="none" />
          </>
        )}
        {id === "lamp" && (
          <>
            <path d="M50 39V66 M33 69H67" fill="none" />
            <path
              d="m50 4 9 17 19 3-14 14 3 20-17-9-17 9 3-20-14-14 19-3z"
              fill="#FFF3A8"
            />
            <path d="M45 33 Q50 38 55 33" fill="none" />
          </>
        )}
        {id === "rug" && (
          <>
            <path
              d="M10 48 Q1 31 23 30 Q30 8 48 25 Q70 9 78 29 Q99 25 92 48 Q65 72 10 48Z"
              fill="#FFC8DD"
            />
            <path
              d="M27 43 Q50 56 76 42"
              fill="none"
              stroke="#FFFEFA"
              strokeWidth="5"
            />
          </>
        )}
      </g>
    </svg>
  );
}

export function PetAccessory({ id }: { id?: string | null }) {
  if (!id) return null;
  const geometry =
    id === "bow"
      ? { x: 139, y: 21, width: 49, height: 40 }
      : id === "scarf"
        ? { x: 72, y: 110, width: 76, height: 56 }
        : { x: 69, y: -4, width: 82, height: 66 };
  return (
    <svg {...geometry} viewBox="0 0 100 80" aria-hidden="true">
      <ItemArt id={id} />
    </svg>
  );
}
