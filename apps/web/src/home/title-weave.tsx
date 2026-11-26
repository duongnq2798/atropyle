/**
 * One S of thread from the leading under the first line of the question, down past its last line towards the CTAs
 * (spec §18.4.3 Task 5′). Two copies of one path: the one behind the text shows only between the letters; the one in
 * front shows only in a band 0.12em high at the top of the frame, inside the leading, where the thread surfaces
 * before it dives. globals.css (`.title-weave`) places them; `--weave-over: 0` keeps only the copy behind. Its own
 * curve, not the circuit's THREAD, which starts at 79 % of the height and could not ride that band (ruling R24).
 */
const D = 'M0 3C28 3 40 3 50 50S80 97 88 100';

export function TitleWeave() {
  return (
    <span className="title-weave" aria-hidden="true">
      <svg
        className="title-weave-under"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        <path d={D} />
      </svg>
      <svg
        className="title-weave-over"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        <path d={D} />
      </svg>
    </span>
  );
}
