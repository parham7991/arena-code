# Bash completion for Arena Code's `arena` command.
_arena_completions() {
  local cur prev
  cur="${COMP_WORDS[COMP_CWORD]}"
  prev="${COMP_WORDS[COMP_CWORD-1]}"

  local flags="-p --prompt -c --cwd -k --key -u --url -m --max-turns -a --autonomy --stream --no-stream --continue --session --session-id --sessions --selftest -h --help --theme --lang team"
  local commands="team"

  case "$prev" in
    -c|--cwd|-u|--url) COMPREPLY=( $(compgen -d -- "$cur") ); return ;;
    --session|--session-id) COMPREPLY=( $(compgen -f -- "$cur") ); return ;;
    -p|--prompt|-k|--key|-m|--max-turns|-a|--autonomy) COMPREPLY=(); return ;;
  esac

  if [[ "$cur" == -* ]]; then
    COMPREPLY=( $(compgen -W "$flags" -- "$cur") )
  elif [[ "${COMP_WORDS[1]}" == "team" ]]; then
    COMPREPLY=()
  else
    COMPREPLY=( $(compgen -W "$commands" -- "$cur") )
  fi
}
complete -F _arena_completions arena
