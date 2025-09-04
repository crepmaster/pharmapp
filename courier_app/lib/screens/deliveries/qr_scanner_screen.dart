import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../../models/delivery.dart';
import '../../services/delivery_service.dart';

class QRScannerScreen extends StatefulWidget {
  final Delivery delivery;
  final String scanType; // 'pickup' or 'delivery'

  const QRScannerScreen({
    super.key,
    required this.delivery,
    required this.scanType,
  });

  @override
  State<QRScannerScreen> createState() => _QRScannerScreenState();
}

class _QRScannerScreenState extends State<QRScannerScreen> {
  late MobileScannerController _controller;
  bool _isProcessing = false;
  String? _scannedData;

  @override
  void initState() {
    super.initState();
    _controller = MobileScannerController(
      detectionSpeed: DetectionSpeed.noDuplicates,
      facing: CameraFacing.back,
      torchEnabled: false,
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Scan ${widget.scanType == 'pickup' ? 'Pickup' : 'Delivery'} QR Code'),
        backgroundColor: const Color(0xFF4CAF50),
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
      body: Column(
        children: [
          // Instructions banner
          Container(
            width: double.infinity,
            color: const Color(0xFF4CAF50),
            padding: const EdgeInsets.all(16),
            child: Column(
              children: [
                Icon(
                  widget.scanType == 'pickup' ? Icons.store : Icons.local_hospital,
                  color: Colors.white,
                  size: 32,
                ),
                const SizedBox(height: 8),
                Text(
                  widget.scanType == 'pickup' 
                    ? 'Scan the QR code at ${widget.delivery.pickup.pharmacyName}'
                    : 'Scan the QR code at ${widget.delivery.delivery.pharmacyName}',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 4),
                Text(
                  widget.scanType == 'pickup' 
                    ? 'This confirms you have collected the items'
                    : 'This confirms successful delivery',
                  style: const TextStyle(
                    color: Colors.white70,
                    fontSize: 14,
                  ),
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          ),
          
          // Camera scanner
          Expanded(
            child: Stack(
              children: [
                MobileScanner(
                  controller: _controller,
                  onDetect: _onQRDetected,
                  overlay: _buildScannerOverlay(),
                ),
                
                // Processing indicator
                if (_isProcessing)
                  Container(
                    color: Colors.black54,
                    child: const Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          CircularProgressIndicator(
                            valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                          ),
                          SizedBox(height: 16),
                          Text(
                            'Processing QR Code...',
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 18,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                
                // Scanned data display
                if (_scannedData != null && !_isProcessing)
                  Positioned(
                    bottom: 100,
                    left: 16,
                    right: 16,
                    child: Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: Colors.black87,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Text(
                            'Scanned Code:',
                            style: TextStyle(
                              color: Colors.white70,
                              fontSize: 14,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            _scannedData!,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 16,
                              fontWeight: FontWeight.w500,
                            ),
                            textAlign: TextAlign.center,
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ),
          
          // Action buttons
          Container(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Expanded(
                  child: ElevatedButton.icon(
                    onPressed: _isProcessing ? null : () => _verifyManually(),
                    icon: const Icon(Icons.keyboard),
                    label: const Text('Enter Code Manually'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.grey[700],
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 12),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: ElevatedButton.icon(
                    onPressed: _isProcessing ? null : _skipVerification,
                    icon: const Icon(Icons.skip_next),
                    label: const Text('Skip (Emergency)'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.orange,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 12),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildScannerOverlay() {
    return Container(
      decoration: const ShapeDecoration(
        shape: QRScannerOverlayShape(
          borderColor: Color(0xFF4CAF50),
          borderRadius: 10,
          borderLength: 30,
          borderWidth: 10,
          cutOutSize: 250,
        ),
      ),
    );
  }

  void _onQRDetected(BarcodeCapture capture) {
    if (_isProcessing || capture.barcodes.isEmpty) return;

    final barcode = capture.barcodes.first;
    final scannedData = barcode.rawValue;

    if (scannedData != null && scannedData.isNotEmpty) {
      setState(() {
        _scannedData = scannedData;
        _isProcessing = true;
      });

      _processQRCode(scannedData);
    }
  }

  Future<void> _processQRCode(String qrData) async {
    try {
      // Parse QR code data
      final isValidCode = _validateQRCode(qrData);
      
      if (isValidCode) {
        // Update delivery status based on scan type
        if (widget.scanType == 'pickup') {
          await DeliveryService.updateDeliveryStatus(
            widget.delivery.id, 
            DeliveryStatus.pickedUp,
            notes: 'Items picked up - QR verified: $qrData',
          );
        } else {
          await DeliveryService.updateDeliveryStatus(
            widget.delivery.id, 
            DeliveryStatus.delivered,
            notes: 'Delivery completed - QR verified: $qrData',
          );
        }

        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                widget.scanType == 'pickup' 
                  ? 'Items picked up successfully!'
                  : 'Delivery completed successfully!',
              ),
              backgroundColor: const Color(0xFF4CAF50),
              duration: const Duration(seconds: 2),
            ),
          );

          await Future.delayed(const Duration(seconds: 1));
          Navigator.pop(context, true); // Return success
        }
      } else {
        throw 'Invalid QR code for this delivery';
      }
    } catch (e) {
      setState(() => _isProcessing = false);
      
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Verification failed: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  bool _validateQRCode(String qrData) {
    try {
      // Expected QR format: "DELIVERY:{deliveryId}:{type}:{timestamp}"
      // or "PICKUP:{exchangeId}:{pharmacyId}:{timestamp}"
      final parts = qrData.split(':');
      
      if (parts.length < 3) return false;
      
      final qrType = parts[0].toUpperCase();
      final expectedType = widget.scanType == 'pickup' ? 'PICKUP' : 'DELIVERY';
      
      if (qrType != expectedType) return false;
      
      // For pickup: check exchange ID
      if (widget.scanType == 'pickup') {
        final exchangeId = parts[1];
        return exchangeId == widget.delivery.exchangeId;
      }
      
      // For delivery: check delivery ID
      if (widget.scanType == 'delivery') {
        final deliveryId = parts[1];
        return deliveryId == widget.delivery.id;
      }
      
      return false;
    } catch (e) {
      print('QR validation error: $e');
      return false;
    }
  }

  void _verifyManually() {
    showDialog(
      context: context,
      builder: (context) => _ManualVerificationDialog(
        scanType: widget.scanType,
        delivery: widget.delivery,
        onVerified: (success) {
          if (success && mounted) {
            Navigator.pop(context, true);
          }
        },
      ),
    );
  }

  void _skipVerification() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Skip Verification?'),
        content: Text(
          widget.scanType == 'pickup'
            ? 'Are you sure you want to mark items as picked up without QR verification? This should only be used in emergencies.'
            : 'Are you sure you want to mark delivery as completed without QR verification? This should only be used in emergencies.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () async {
              Navigator.pop(context); // Close dialog
              
              try {
                final status = widget.scanType == 'pickup' 
                  ? DeliveryStatus.pickedUp 
                  : DeliveryStatus.delivered;
                
                await DeliveryService.updateDeliveryStatus(
                  widget.delivery.id,
                  status,
                  notes: 'MANUAL VERIFICATION - No QR scan (Emergency skip)',
                );

                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(
                        widget.scanType == 'pickup'
                          ? 'Items marked as picked up (Manual)'
                          : 'Delivery marked as completed (Manual)',
                      ),
                      backgroundColor: Colors.orange,
                    ),
                  );
                  Navigator.pop(context, true);
                }
              } catch (e) {
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text('Failed to update status: $e'),
                      backgroundColor: Colors.red,
                    ),
                  );
                }
              }
            },
            child: const Text('Skip', style: TextStyle(color: Colors.orange)),
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
}

class _ManualVerificationDialog extends StatefulWidget {
  final String scanType;
  final Delivery delivery;
  final Function(bool) onVerified;

  const _ManualVerificationDialog({
    required this.scanType,
    required this.delivery,
    required this.onVerified,
  });

  @override
  State<_ManualVerificationDialog> createState() => _ManualVerificationDialogState();
}

class _ManualVerificationDialogState extends State<_ManualVerificationDialog> {
  final _controller = TextEditingController();
  bool _isVerifying = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text('Enter ${widget.scanType == 'pickup' ? 'Pickup' : 'Delivery'} Code'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            'Enter the verification code provided by the ${widget.scanType == 'pickup' ? 'pharmacy' : 'recipient'}:',
            style: TextStyle(color: Colors.grey[600]),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _controller,
            decoration: const InputDecoration(
              labelText: 'Verification Code',
              border: OutlineInputBorder(),
            ),
            autofocus: true,
            textCapitalization: TextCapitalization.characters,
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: _isVerifying ? null : () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
        ElevatedButton(
          onPressed: _isVerifying ? null : _verifyCode,
          style: ElevatedButton.styleFrom(
            backgroundColor: const Color(0xFF4CAF50),
            foregroundColor: Colors.white,
          ),
          child: _isVerifying
            ? const SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            : const Text('Verify'),
        ),
      ],
    );
  }

  Future<void> _verifyCode() async {
    final code = _controller.text.trim();
    if (code.isEmpty) return;

    setState(() => _isVerifying = true);

    try {
      // Process manual verification
      final status = widget.scanType == 'pickup' 
        ? DeliveryStatus.pickedUp 
        : DeliveryStatus.delivered;
      
      await DeliveryService.updateDeliveryStatus(
        widget.delivery.id,
        status,
        notes: 'Manual verification code: $code',
      );

      widget.onVerified(true);
      Navigator.pop(context);
    } catch (e) {
      setState(() => _isVerifying = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Verification failed: $e'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }
}

class QRScannerOverlayShape extends ShapeBorder {
  final Color borderColor;
  final double borderWidth;
  final Color overlayColor;
  final double borderRadius;
  final double borderLength;
  final double cutOutSize;

  const QRScannerOverlayShape({
    this.borderColor = Colors.red,
    this.borderWidth = 3.0,
    this.overlayColor = const Color.fromRGBO(0, 0, 0, 80),
    this.borderRadius = 0,
    this.borderLength = 40,
    this.cutOutSize = 250,
  });

  @override
  EdgeInsetsGeometry get dimensions => const EdgeInsets.all(10);

  @override
  Path getInnerPath(Rect rect, {TextDirection? textDirection}) {
    return Path()
      ..fillType = PathFillType.evenOdd
      ..addPath(getOuterPath(rect), Offset.zero);
  }

  @override
  Path getOuterPath(Rect rect, {TextDirection? textDirection}) {
    Path getLeftTopPath(Rect rect) {
      return Path()
        ..moveTo(rect.left, rect.bottom)
        ..lineTo(rect.left, rect.top + borderRadius)
        ..quadraticBezierTo(rect.left, rect.top, rect.left + borderRadius, rect.top)
        ..lineTo(rect.right, rect.top);
    }

    return getLeftTopPath(rect)
      ..lineTo(rect.right, rect.bottom)
      ..lineTo(rect.left, rect.bottom)
      ..lineTo(rect.left, rect.top);
  }

  @override
  void paint(Canvas canvas, Rect rect, {TextDirection? textDirection}) {
    final width = rect.width;
    final borderWidthSize = width / 2;
    final height = rect.height;
    final borderHeightSize = height / 2;
    final cutOutWidth = cutOutSize < width ? cutOutSize : width - borderWidth;
    final cutOutHeight = cutOutSize < height ? cutOutSize : height - borderWidth;

    final backgroundPaint = Paint()
      ..color = overlayColor
      ..style = PaintingStyle.fill;

    final boxPaint = Paint()
      ..color = borderColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = borderWidth;

    final cutOutRect = Rect.fromLTWH(
      rect.left + (width - cutOutWidth) / 2 + borderWidth,
      rect.top + (height - cutOutHeight) / 2 + borderWidth,
      cutOutWidth - 2 * borderWidth,
      cutOutHeight - 2 * borderWidth,
    );

    canvas
      ..saveLayer(rect, backgroundPaint)
      ..drawRect(rect, backgroundPaint)
      ..drawRRect(
        RRect.fromRectAndRadius(cutOutRect, Radius.circular(borderRadius)),
        backgroundPaint..blendMode = BlendMode.clear,
      )
      ..restore();

    // Draw corner lines
    final path = Path();

    // Top-left corner
    path.moveTo(cutOutRect.left - borderLength, cutOutRect.top);
    path.lineTo(cutOutRect.left, cutOutRect.top);
    path.lineTo(cutOutRect.left, cutOutRect.top - borderLength);

    // Top-right corner
    path.moveTo(cutOutRect.right + borderLength, cutOutRect.top);
    path.lineTo(cutOutRect.right, cutOutRect.top);
    path.lineTo(cutOutRect.right, cutOutRect.top - borderLength);

    // Bottom-left corner
    path.moveTo(cutOutRect.left - borderLength, cutOutRect.bottom);
    path.lineTo(cutOutRect.left, cutOutRect.bottom);
    path.lineTo(cutOutRect.left, cutOutRect.bottom + borderLength);

    // Bottom-right corner
    path.moveTo(cutOutRect.right + borderLength, cutOutRect.bottom);
    path.lineTo(cutOutRect.right, cutOutRect.bottom);
    path.lineTo(cutOutRect.right, cutOutRect.bottom + borderLength);

    canvas.drawPath(path, boxPaint);
  }

  @override
  ShapeBorder scale(double t) {
    return QRScannerOverlayShape(
      borderColor: borderColor,
      borderWidth: borderWidth,
      overlayColor: overlayColor,
    );
  }
}