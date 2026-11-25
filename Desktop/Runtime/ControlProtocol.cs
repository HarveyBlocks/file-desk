using System.Text.Json;
using System.Text.Json.Serialization;

namespace FileDesk.Desktop.Runtime;

/// <summary>Versioned local control messages never depend on human-readable log text.</summary>
public sealed record ControlMessage {
    public int Version { get; init; }
    public string Type { get; init; } = "";
    public string? Token { get; init; }
    public string? State { get; init; }
    public string? Code { get; init; }
    public string? Message { get; init; }
    public ServiceTask[] Tasks { get; init; } = [];

    public static readonly JsonSerializerOptions Json = new() {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public static ControlMessage Parse(string line) {
        if (line.Length > 65536) throw new InvalidDataException("Control frame too large.");
        var message = JsonSerializer.Deserialize<ControlMessage>(line, Json);
        if (message is null || message.Version != 1 || string.IsNullOrEmpty(message.Type))
            throw new InvalidDataException("Unsupported service control protocol.");
        return message;
    }
}

/// <summary>Progress is optional when the total amount of work cannot be known.</summary>
public sealed record ServiceTask {
    public string Id { get; init; } = "";
    public string Operation { get; init; } = "";
    public string Path { get; init; } = "";
    public string Phase { get; init; } = "";
    public long Completed { get; init; }
    public long? Total { get; init; }
    public string Unit { get; init; } = "bytes";
    [JsonIgnore] public bool Indeterminate => Total is null;
    [JsonIgnore] public double Percentage => Total is > 0 ? Math.Clamp(100.0 * Completed / Total.Value, 0, 100) : 0;
    [JsonIgnore] public string ProgressText => Unit == "bytes"
        ? $"{Completed:N0}" + (Total is not null ? $" / {Total:N0}" : "") + (Operation is "Download" or "Preview" or "ZIP" ? " bytes sent by server" : " bytes received")
        : $"{Completed:N0} entries processed";
}
