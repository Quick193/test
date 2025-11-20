public class Main {
  public static String greet(String name) {
    return "Hello, " + name + "!";
  }

  public static void main(String[] args) throws Exception {
    java.io.BufferedReader reader = new java.io.BufferedReader(new java.io.InputStreamReader(System.in));
    String name = reader.readLine();
    if (name == null || name.isBlank()) name = "world";
    System.out.println(greet(name));
  }
}
