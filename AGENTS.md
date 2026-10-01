<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Serve Georgian glyphs from bundled Noto Sans Georgian files and keep them first for `lang="ka"`, so rendering never depends on device fonts.
- Derive the vehicle arrow's screen rotation from CameraEngine's same-frame applied heading, avoiding asynchronous map-heading reads.
