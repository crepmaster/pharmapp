import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:mobile_scanner/mobile_scanner.dart';
import '../../models/barcode_medicine_data.dart';
import '../../services/barcode_parser_service.dart';

/// Screen for scanning medicine barcodes with auto-detection of multiple formats
class BarcodeScannerScreen extends StatefulWidget {
  const BarcodeScannerScreen({super.key});

  @override
  State<BarcodeScannerScreen> createState() => _BarcodeScannerScreenState();
}

class _BarcodeScannerScreenState extends State<BarcodeScannerScreen> {
  late MobileScannerController _controller;
  final BarcodeParserService _parserService = BarcodeParserService();
  
  bool _isProcessing = false;
  String? _lastScanned;
  
  @override
  void initState() {
    super.initState();
    if (!kIsWeb) {
      _controller = MobileScannerController(
        detectionSpeed: DetectionSpeed.noDuplicates,
        facing: CameraFacing.back,
        torchEnabled: false,
        formats: [
          BarcodeFormat.ean13,
          BarcodeFormat.upcA,
          BarcodeFormat.dataMatrix,
          BarcodeFormat.code128,
          BarcodeFormat.qrCode,
        ],
      );
    }
  }

  @override
  void dispose() {
    if (!kIsWeb) {
      _controller.dispose();
    }
    super.dispose();
  }

  void _onBarcodeDetected(BarcodeCapture capture) {
    if (_isProcessing) return;

    final firstBarcode = capture.barcodes.first;
    final rawValue = firstBarcode.rawValue;
    
    if (rawValue == null || rawValue == _lastScanned) return;
    
    setState(() {
      _isProcessing = true;
      _lastScanned = rawValue;
    });

    // Parse the barcode data
    final result = _parserService.parseBarcode(capture);
    
    if (result.success && result.medicineData != null) {
      // Return successful scan result
      if (mounted) {
        Navigator.of(context).pop(result.medicineData);
      }
    } else {
      // Show error and allow retry
      _showErrorDialog(result.error ?? 'Unknown error');
      setState(() {
        _isProcessing = false;
        _lastScanned = null;
      });
    }
  }

  void _showErrorDialog(String error) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Scan Error'),
        content: Text(error),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.of(context).pop();
              setState(() {
                _isProcessing = false;
                _lastScanned = null;
              });
            },
            child: const Text('Retry'),
          ),
          TextButton(
            onPressed: () {
              Navigator.of(context).pop(); // Close dialog
              Navigator.of(context).pop(); // Close scanner
            },
            child: const Text('Cancel'),
          ),
        ],
      ),
    );
  }

  void _toggleTorch() {
    _controller.toggleTorch();
  }

  void _switchCamera() {
    _controller.switchCamera();
  }

  void _manualEntry() {
    showDialog(
      context: context,
      builder: (context) => _ManualBarcodeEntryDialog(
        onBarcodeEntered: (barcode) {
          Navigator.of(context).pop(); // Close dialog
          
          // Create a fake capture for manual entry
          final fakeCapture = BarcodeCapture(barcodes: [
            Barcode(
              rawValue: barcode,
              displayValue: barcode,
              format: BarcodeFormat.unknown,
              type: BarcodeType.unknown,
            ),
          ]);
          
          _onBarcodeDetected(fakeCapture);
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    // Show manual entry only for web
    if (kIsWeb) {
      return _buildWebOnlyInterface(context);
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Scan Medicine Barcode'),
        backgroundColor: const Color(0xFF1976D2),
        foregroundColor: Colors.white,
        actions: [
          IconButton(
            onPressed: _toggleTorch,
            icon: ValueListenableBuilder<TorchState>(
              valueListenable: _controller.torchState,
              builder: (context, state, child) {
                return Icon(
                  state == TorchState.on ? Icons.flash_on : Icons.flash_off,
                  color: Colors.white,
                );
              },
            ),
          ),
          IconButton(
            onPressed: _switchCamera,
            icon: ValueListenableBuilder<CameraFacing>(
              valueListenable: _controller.cameraFacingState,
              builder: (context, state, child) {
                return Icon(
                  state == CameraFacing.front ? Icons.camera_rear : Icons.camera_front,
                  color: Colors.white,
                );
              },
            ),
          ),
        ],
      ),
      body: Stack(
        children: [
          // Camera preview
          MobileScanner(
            controller: _controller,
            onDetect: _onBarcodeDetected,
          ),
          
          // Scanning overlay
          _buildScanningOverlay(),
          
          // Bottom instructions panel
          Positioned(
            bottom: 0,
            left: 0,
            right: 0,
            child: _buildInstructionsPanel(),
          ),
          
          // Processing overlay
          if (_isProcessing)
            Container(
              color: Colors.black54,
              child: const Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    CircularProgressIndicator(color: Colors.white),
                    SizedBox(height: 16),
                    Text(
                      'Processing barcode...',
                      style: TextStyle(color: Colors.white, fontSize: 16),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildScanningOverlay() {
    return Center(
      child: Container(
        width: 300,
        height: 200,
        decoration: BoxDecoration(
          border: Border.all(color: Colors.white, width: 2),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Stack(
          children: [
            // Corner indicators
            ...List.generate(4, (index) {
              final isTop = index < 2;
              final isLeft = index % 2 == 0;
              
              return Positioned(
                top: isTop ? -1 : null,
                bottom: !isTop ? -1 : null,
                left: isLeft ? -1 : null,
                right: !isLeft ? -1 : null,
                child: Container(
                  width: 20,
                  height: 20,
                  decoration: BoxDecoration(
                    color: const Color(0xFF1976D2),
                    borderRadius: BorderRadius.only(
                      topLeft: isTop && isLeft ? const Radius.circular(12) : Radius.zero,
                      topRight: isTop && !isLeft ? const Radius.circular(12) : Radius.zero,
                      bottomLeft: !isTop && isLeft ? const Radius.circular(12) : Radius.zero,
                      bottomRight: !isTop && !isLeft ? const Radius.circular(12) : Radius.zero,
                    ),
                  ),
                ),
              );
            }),
            
            // Scanning line animation
            const Center(
              child: Text(
                'Align barcode within frame',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                ),
                textAlign: TextAlign.center,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildInstructionsPanel() {
    return Container(
      color: Colors.black87,
      padding: const EdgeInsets.all(20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text(
            'Supported Formats',
            style: TextStyle(
              color: Colors.white,
              fontSize: 16,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 12),
          
          // Supported barcode types
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _buildBarcodeChip('EAN-13', Icons.view_stream),
              _buildBarcodeChip('GS1 DataMatrix', Icons.qr_code_2),
              _buildBarcodeChip('UPC-A', Icons.view_stream),
              _buildBarcodeChip('GS1 DataBar', Icons.view_column),
            ],
          ),
          
          const SizedBox(height: 16),
          
          // Manual entry button
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: _manualEntry,
              icon: const Icon(Icons.keyboard),
              label: const Text('Enter Barcode Manually'),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF1976D2),
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 12),
              ),
            ),
          ),
          
          const SizedBox(height: 8),
          
          const Text(
            'Point camera at medicine barcode or package',
            style: TextStyle(color: Colors.white70, fontSize: 12),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }

  Widget _buildBarcodeChip(String label, IconData icon) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: const Color(0xFF1976D2).withValues(alpha: 0.3),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFF1976D2)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: Colors.white),
          const SizedBox(width: 4),
          Text(
            label,
            style: const TextStyle(color: Colors.white, fontSize: 12),
          ),
        ],
      ),
    );
  }

  /// Web-only interface since camera access is limited
  Widget _buildWebOnlyInterface(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Enter Medicine Barcode'),
        backgroundColor: const Color(0xFF1976D2),
        foregroundColor: Colors.white,
      ),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                Icons.qr_code_scanner,
                size: 120,
                color: Colors.grey.shade400,
              ),
              const SizedBox(height: 24),
              Text(
                'Camera scanning not available on web',
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  color: Colors.grey.shade600,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 16),
              Text(
                'Please enter the barcode number manually from your medicine package.',
                style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                  color: Colors.grey.shade600,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 32),
              SizedBox(
                width: 300,
                child: ElevatedButton.icon(
                  onPressed: _manualEntry,
                  icon: const Icon(Icons.keyboard),
                  label: const Text('Enter Barcode Manually'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF1976D2),
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 16),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Dialog for manual barcode entry when camera scanning fails
class _ManualBarcodeEntryDialog extends StatefulWidget {
  final Function(String) onBarcodeEntered;

  const _ManualBarcodeEntryDialog({
    required this.onBarcodeEntered,
  });

  @override
  State<_ManualBarcodeEntryDialog> createState() => __ManualBarcodeEntryDialogState();
}

class __ManualBarcodeEntryDialogState extends State<_ManualBarcodeEntryDialog> {
  final _controller = TextEditingController();
  final _formKey = GlobalKey<FormState>();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Enter Barcode Manually'),
      content: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Enter the barcode number from the medicine package:',
              style: TextStyle(fontSize: 14),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _controller,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: 'Barcode Number',
                hintText: 'e.g. 1234567890123',
                border: OutlineInputBorder(),
              ),
              validator: (value) {
                if (value == null || value.isEmpty) {
                  return 'Please enter a barcode number';
                }
                if (!RegExp(r'^\d+$').hasMatch(value)) {
                  return 'Barcode should contain only numbers';
                }
                if (value.length < 8 || value.length > 20) {
                  return 'Invalid barcode length';
                }
                return null;
              },
            ),
            const SizedBox(height: 8),
            const Text(
              'Tip: Look for numbers under the barcode stripes',
              style: TextStyle(fontSize: 12, color: Colors.grey),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        ElevatedButton(
          onPressed: () {
            if (_formKey.currentState!.validate()) {
              widget.onBarcodeEntered(_controller.text.trim());
            }
          },
          child: const Text('Use This Barcode'),
        ),
      ],
    );
  }
}