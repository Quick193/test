def greet(name: str) -> str:
    return f"Hello, {name}!"

if __name__ == "__main__":
    import sys
    name = sys.stdin.readline().strip() or "world"
    print(greet(name))
