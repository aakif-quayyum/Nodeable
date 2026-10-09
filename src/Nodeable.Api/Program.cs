using Nodeable.ServiceDefaults;

// LEARN: LG-01 top-level-statements | No Main method or class needed: the compiler wraps these statements in one, so this reads like a Node entry file (const app = express(); app.listen())
var builder = WebApplication.CreateBuilder(args);

// LEARN: LG-01 builder-pattern | Startup has two phases: register services on the builder, then Build() freezes the container and returns the app used to configure the request pipeline
builder.AddServiceDefaults();

var app = builder.Build();

app.MapDefaultEndpoints();

app.Run();

// Exposes the compiler-generated Program class to the test project, so WebApplicationFactory<Program> can start this app in memory.
public partial class Program;
